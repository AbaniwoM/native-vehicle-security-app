import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Modal, Image, Alert, Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaView } from "react-native-safe-area-context";
import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { useRouter, useRootNavigationState } from "expo-router";
import { useColorScheme } from "nativewind";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, query, where, getDocs, doc, setDoc, getDoc, getCountFromServer } from "firebase/firestore";
import { db } from "../lib/firebase";
import { UserProfile } from "../types";
import AdminRegistration from "../components/AdminRegistration";

interface OrgData {
  churchName: string;
  logoUrl?: string;
  email?: string;
  adminPasscode?: string;
  expiryDate?: any;
}

export default function LoginScreen() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { colorScheme, toggleColorScheme } = useColorScheme();

  const [role, setRole] = useState<"user" | "admin">("user");
  const [adminTab, setAdminTab] = useState<"login" | "register">("login");
  const [userType, setUserType] = useState<"returning" | "new">("returning");
  const [adminCode, setAdminCode] = useState("");
  const [modalMessage, setModalMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<Omit<UserProfile, "id">>({
    church: "",
    name: "",
    phone: "",
    vehicleModel: "",
    vehicleColor: "",
    plate: "",
    stateOfRegistration: "",
    occupants: "",
    email: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const [allOrgs, setAllOrgs] = useState<OrgData[]>([]);
  const [filteredOrgs, setFilteredOrgs] = useState<OrgData[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [showRenewButton, setShowRenewButton] = useState(false);
  const [renewingChurch, setRenewingChurch] = useState("");
  const [renewingEmail, setRenewingEmail] = useState("");
  const [userCount, setUserCount] = useState<number>(0);

  const generateId = (name: string, phone: string) =>
    `${name.toLowerCase().trim().replace(/\s+/g, "-")}-${phone.trim()}`;

  const validate = (): boolean => {
    if (role === "admin" || userType === "returning") return true;
    const newErrors: Record<string, string> = {};
    if (formData.name.length < 3) newErrors.name = "Enter a valid full name";
    const phoneRegex = /^0[789][01]\d{8}$/;
    if (!phoneRegex.test(formData.phone)) newErrors.phone = "Invalid format (08012345678)";
    const plateRegex = /^[A-Z0-9\s-]{2,15}$/i;
    if (!plateRegex.test(formData.plate.trim())) {
      newErrors.plate = "Please enter a valid plate number";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRenewSubscription = async () => {
    const targetChurch = renewingChurch || formData.church;
    if (!targetChurch) return;

    try {
      const res = await fetch("https://tishmor.com/api/initiate-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tx_ref: `RENEW-${Date.now()}`,
          meta: { orgName: targetChurch, isRenewal: true, email: renewingEmail || "admin@vehicle-security.app" },
        }),
      });
      const data = await res.json();
      if (data.payment_link) {
        await WebBrowser.openBrowserAsync(data.payment_link);
      } else {
        Alert.alert("Error", "Payment initiation failed.");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Network Error", "Please try again.");
    }
  };

  const handleLogin = async () => {
    if (isLoading) return;
    if (role === "user" && userType === "new" && !validate()) return;
    setIsLoading(true);

    try {
      if (role === "admin") {
        if (!formData.church) {
          setModalMessage("Please enter the Organization/Church name.");
          setIsLoading(false);
          return;
        }

        const orgRef = collection(db, "organizations");
        const q = query(orgRef, where("churchName", "==", formData.church));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          setModalMessage("Church/Organization not found. Please register and subscribe first.");
          setIsLoading(false);
          return;
        }

        const orgDoc = querySnapshot.docs[0];
        const orgData = orgDoc.data() as OrgData;

        if (orgData.adminPasscode !== adminCode) {
          setModalMessage("Invalid access code.");
          setIsLoading(false);
          return;
        }

        const expiryDate = orgData.expiryDate?.toDate
          ? orgData.expiryDate.toDate()
          : orgData.expiryDate ? new Date(orgData.expiryDate) : null;
        
        const isExpired = expiryDate && new Date() > expiryDate && orgData.churchName !== "RCCG The Oasis";

        if (isExpired) {
          setModalMessage("Your subscription has expired. Please renew to continue.");
          setRenewingChurch(orgData.churchName);
          setRenewingEmail(orgData.email || "");
          setShowRenewButton(true);
          setIsLoading(false);
          return;
        }

        await AsyncStorage.setItem("rememberedAdmin", JSON.stringify({ church: orgData.churchName, adminCode }));
        await AsyncStorage.setItem("adminChurch", orgData.churchName);
        router.replace("/admin");
        return;
      }

      // User logic
      const docId = generateId(formData.name, formData.phone);
      const userRef = doc(db, "users", docId);
      const selectedOrg = allOrgs.find(org => org.churchName === formData.church);
      const logoUrl = selectedOrg?.logoUrl || "";

      if (userType === "returning") {
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
          const userData = { ...docSnap.data(), id: docId, logoUrl };
          await AsyncStorage.setItem("user", JSON.stringify(userData));
          await AsyncStorage.setItem("rememberedUser", JSON.stringify({ name: formData.name, phone: formData.phone, church: formData.church }));
          router.replace("/dashboard");
        } else {
          setModalMessage("User profile not found. Please verify your Name and Phone.");
          setIsLoading(false);
        }
      } else {
        await setDoc(userRef, { ...formData, id: docId }, { merge: true });
        const userData = { ...formData, id: docId, logoUrl };
        await AsyncStorage.setItem("user", JSON.stringify(userData));
        await AsyncStorage.setItem("rememberedUser", JSON.stringify({ name: formData.name, phone: formData.phone, church: formData.church }));
        router.replace("/dashboard");
      }
    } catch (error) {
      console.error("Login error:", error);
      setModalMessage("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!rootNavigationState?.key) return; // Wait for navigation to be ready

    const checkState = async () => {
      const activeUser = await AsyncStorage.getItem("user");
      if (activeUser) {
        router.replace("/dashboard");
        return;
      }
      const activeAdmin = await AsyncStorage.getItem("adminChurch");
      if (activeAdmin) {
        router.replace("/admin");
        return;
      }

      const rememberedUser = await AsyncStorage.getItem("rememberedUser");
      if (rememberedUser) {
        try {
          const parsed = JSON.parse(rememberedUser);
          setFormData((prev) => ({ ...prev, ...parsed }));
          setRole("user");
          setUserType("returning");
        } catch (e) {}
      }

      const rememberedAdmin = await AsyncStorage.getItem("rememberedAdmin");
      if (rememberedAdmin) {
        try {
          const parsed = JSON.parse(rememberedAdmin);
          setFormData((prev) => ({ ...prev, church: parsed.church }));
          setAdminCode(parsed.adminCode);
        } catch (e) {}
      }
    };

    const fetchOrganizations = async () => {
      try {
        const orgSnapshot = await getDocs(collection(db, "organizations"));
        const orgList = orgSnapshot.docs.map((d) => d.data() as OrgData);
        setAllOrgs(orgList);
        setFilteredOrgs(orgList);
      } catch (err) {
        console.error("Error fetching organizations:", err);
      }
    };

    const fetchUserCount = async () => {
      try {
        const snap = await getCountFromServer(collection(db, "users"));
        setUserCount(snap.data().count);
      } catch (err) {
        console.error("Error fetching user count:", err);
      }
    };

    checkState();
    fetchOrganizations();
    fetchUserCount();
  }, [rootNavigationState?.key]);

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-gray-50 dark:bg-gray-900 transition-colors">
      <ScrollView className="flex-1 bg-gray-50 dark:bg-gray-900" contentContainerClassName="items-center justify-center py-10 px-4 min-h-full">
        
        <View className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 border border-transparent dark:border-gray-700 relative">
          
          {/* Theme Toggle Button */}
          <TouchableOpacity 
            onPress={toggleColorScheme} 
            className="absolute top-4 right-4 p-2 bg-gray-100 dark:bg-gray-700 rounded-full z-10"
          >
            <Ionicons 
              name={colorScheme === "dark" ? "moon" : "sunny"} 
              size={20} 
              color={colorScheme === "dark" ? "#60a5fa" : "#f59e0b"} 
            />
          </TouchableOpacity>

          <View className="items-center py-4 mb-6">
            <Image 
              source={{ uri: "https://res.cloudinary.com/dxcjoih6t/image/upload/v1783603338/Tishmor_x1gdyi.jpg" }} 
              className="w-32 h-32 rounded-2xl"
            />
            <Text className="text-3xl font-extrabold text-gray-900 dark:text-white mt-4">Welcome</Text>
            <Text className="text-base text-gray-600 dark:text-gray-300 mt-1 text-center">Manage your gate access and ensure vehicle safety</Text>
          </View>

          {/* Role Toggle */}
          <View className="flex-row bg-gray-100 dark:bg-gray-700 p-1 rounded-lg mb-6">
            <TouchableOpacity onPress={() => setRole("user")} disabled={isLoading} className={`flex-1 py-3 items-center rounded-md ${role === "user" ? "bg-white dark:bg-gray-600" : ""}`} style={role === "user" ? { elevation: 2, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } } : {}}>
              <Text className={`font-bold ${role === "user" ? "text-teal-700 dark:text-teal-400" : "text-gray-500 dark:text-gray-400"}`}>User</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRole("admin")} disabled={isLoading} className={`flex-1 py-3 items-center rounded-md ${role === "admin" ? "bg-white dark:bg-gray-600" : ""}`} style={role === "admin" ? { elevation: 2, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } } : {}}>
              <Text className={`font-bold ${role === "admin" ? "text-teal-700 dark:text-teal-400" : "text-gray-500 dark:text-gray-400"}`}>Admin</Text>
            </TouchableOpacity>
          </View>

          {role === "admin" && (
            <View className="flex-row bg-gray-50 dark:bg-gray-700 p-1 rounded-lg mb-6">
              <TouchableOpacity onPress={() => setAdminTab("login")} disabled={isLoading} className={`flex-1 py-2 items-center rounded-md ${adminTab === "login" ? "bg-white dark:bg-gray-600" : ""}`} style={adminTab === "login" ? { elevation: 2, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } } : {}}>
                <Text className={`font-bold ${adminTab === "login" ? "text-teal-700 dark:text-teal-400" : "text-gray-500 dark:text-gray-400"}`}>Login</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAdminTab("register")} disabled={isLoading} className={`flex-1 py-2 items-center rounded-md ${adminTab === "register" ? "bg-white dark:bg-gray-600" : ""}`} style={adminTab === "register" ? { elevation: 2, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } } : {}}>
                <Text className={`font-bold ${adminTab === "register" ? "text-teal-700 dark:text-teal-400" : "text-gray-500 dark:text-gray-400"}`}>Register</Text>
              </TouchableOpacity>
            </View>
          )}

          {role === "user" && (
            <View className="flex-row bg-gray-50 dark:bg-gray-700 p-1 rounded-lg mb-6">
              <TouchableOpacity onPress={() => setUserType("returning")} disabled={isLoading} className={`flex-1 py-2 items-center rounded-md ${userType === "returning" ? "bg-white dark:bg-gray-600" : ""}`} style={userType === "returning" ? { elevation: 2, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } } : {}}>
                <Text className={`font-bold ${userType === "returning" ? "text-teal-700 dark:text-teal-400" : "text-gray-500 dark:text-gray-400"}`}>Returning User</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setUserType("new")} disabled={isLoading} className={`flex-1 py-2 items-center rounded-md ${userType === "new" ? "bg-white dark:bg-gray-600" : ""}`} style={userType === "new" ? { elevation: 2, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } } : {}}>
                <Text className={`font-bold ${userType === "new" ? "text-teal-700 dark:text-teal-400" : "text-gray-500 dark:text-gray-400"}`}>New User</Text>
              </TouchableOpacity>
            </View>
          )}

          {role === "admin" && adminTab === "register" ? (
            <AdminRegistration />
          ) : (
            <View className="gap-y-4">
              {role === "user" ? (
                <>
                  <TextInput
                    placeholder="Full Name"
                    placeholderTextColor="#9ca3af"
                    value={formData.name}
                    onChangeText={(text) => setFormData({ ...formData, name: text })}
                    className={`w-full px-4 py-3 border rounded-lg text-black dark:text-white ${errors.name ? "border-red-500" : "border-gray-300 dark:border-gray-600"} ${isLoading ? "bg-gray-100 dark:bg-gray-700" : "dark:bg-gray-800"}`}
                  />
                  <TextInput
                    placeholder="WhatsApp Number"
                    placeholderTextColor="#9ca3af"
                    value={formData.phone}
                    onChangeText={(text) => setFormData({ ...formData, phone: text })}
                    keyboardType="phone-pad"
                    className={`w-full px-4 py-3 border rounded-lg text-black dark:text-white ${errors.phone ? "border-red-500" : "border-gray-300 dark:border-gray-600"} dark:bg-gray-800`}
                  />
                  {userType === "new" && (
                    <>
                      <TextInput
                        placeholder="Church / Organization"
                        placeholderTextColor="#9ca3af"
                        value={formData.church}
                        onFocus={() => setIsDropdownOpen(true)}
                        onChangeText={(text) => {
                          setFormData({ ...formData, church: text });
                          setFilteredOrgs(allOrgs.filter((org) => org.churchName.toLowerCase().includes(text.toLowerCase())));
                          setIsDropdownOpen(true);
                        }}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-black dark:text-white dark:bg-gray-800"
                      />
                      {isDropdownOpen && formData.church.length > 0 && (
                        <View className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48">
                          <ScrollView nestedScrollEnabled>
                            {filteredOrgs.map((org, index) => (
                              <TouchableOpacity key={index} className="p-4 border-b border-gray-100 dark:border-gray-700 flex-row items-center gap-3" onPress={() => { setFormData({ ...formData, church: org.churchName }); setIsDropdownOpen(false); }}>
                                {org.logoUrl ? (
                                  <Image source={{ uri: org.logoUrl }} resizeMode="contain" className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-600 bg-white" />
                                ) : (
                                  <View className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 items-center justify-center">
                                    <Text className="text-gray-500 dark:text-gray-400 font-bold">{org.churchName.charAt(0)}</Text>
                                  </View>
                                )}
                                <Text className="text-black dark:text-white font-medium flex-1">{org.churchName}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      )}
                      <TextInput placeholderTextColor="#9ca3af" placeholder="Vehicle Model" value={formData.vehicleModel} onChangeText={(text) => setFormData({...formData, vehicleModel: text})} className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-black dark:text-white dark:bg-gray-800" />
                      <TextInput placeholderTextColor="#9ca3af" placeholder="Vehicle Colour" value={formData.vehicleColor} onChangeText={(text) => setFormData({...formData, vehicleColor: text})} className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-black dark:text-white dark:bg-gray-800" />
                      <TextInput placeholderTextColor="#9ca3af" placeholder="Vehicle Plate Number" value={formData.plate} onChangeText={(text) => setFormData({...formData, plate: text})} className={`w-full px-4 py-3 border rounded-lg text-black dark:text-white dark:bg-gray-800 ${errors.plate ? "border-red-500" : "border-gray-300 dark:border-gray-600"}`} />
                      {errors.plate && <Text className="text-red-500 text-xs mt-1">{errors.plate}</Text>}
                      <TextInput placeholderTextColor="#9ca3af" placeholder="State of Vehicle Registration" value={formData.stateOfRegistration} onChangeText={(text) => setFormData({...formData, stateOfRegistration: text})} className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-black dark:text-white dark:bg-gray-800" />
                      <TextInput placeholderTextColor="#9ca3af" placeholder="Vehicle Occupants apart from you" value={formData.occupants} onChangeText={(text) => setFormData({...formData, occupants: text})} className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-black dark:text-white dark:bg-gray-800" />
                    </>
                  )}
                </>
              ) : (
                <>
                  <TextInput
                    placeholder="Search for your Church..."
                    placeholderTextColor="#9ca3af"
                    value={formData.church}
                    onFocus={() => setIsDropdownOpen(true)}
                    onChangeText={(text) => {
                      setFormData({ ...formData, church: text });
                      setFilteredOrgs(allOrgs.filter((org) => org.churchName.toLowerCase().includes(text.toLowerCase())));
                      setIsDropdownOpen(true);
                    }}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-black dark:text-white dark:bg-gray-800"
                  />
                  {isDropdownOpen && formData.church.length > 0 && (
                    <View className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48">
                      <ScrollView nestedScrollEnabled>
                        {filteredOrgs.map((org, index) => (
                          <TouchableOpacity key={index} className="p-4 border-b border-gray-100 dark:border-gray-700 flex-row items-center gap-3" onPress={() => { setFormData({ ...formData, church: org.churchName }); setIsDropdownOpen(false); }}>
                            {org.logoUrl ? (
                              <Image source={{ uri: org.logoUrl }} resizeMode="contain" className="w-8 h-8 rounded-full border border-gray-200 dark:border-gray-600 bg-white" />
                            ) : (
                              <View className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 items-center justify-center">
                                <Text className="text-gray-500 dark:text-gray-400 font-bold">{org.churchName.charAt(0)}</Text>
                              </View>
                            )}
                            <Text className="text-black dark:text-white font-medium flex-1">{org.churchName}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                  <View className="relative">
                    <TextInput
                      placeholder="Enter Admin Access Code"
                      placeholderTextColor="#9ca3af"
                      value={adminCode}
                      onChangeText={setAdminCode}
                      secureTextEntry={!showAdminPass}
                      className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-black dark:text-white dark:bg-gray-800 pr-12"
                    />
                    <TouchableOpacity className="absolute right-4 top-4" onPress={() => setShowAdminPass(!showAdminPass)}>
                      <Text>{showAdminPass ? "👁️" : "🙈"}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              <TouchableOpacity onPress={handleLogin} disabled={isLoading} className={`w-full py-4 rounded-lg items-center justify-center mt-4 ${isLoading ? "bg-gray-400" : "bg-teal-700"}`}>
                {isLoading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-lg">{role === "admin" ? "Enter Admin Portal" : userType === "returning" ? "Login" : "Register"}</Text>}
              </TouchableOpacity>

              {!modalMessage && role === "admin" && (
                <>
                  <View className="flex-row items-center my-4 w-full">
                    <View className="flex-1 h-[1px] bg-gray-200 dark:bg-gray-700" />
                    <Text className="px-3 text-gray-400 text-sm font-medium">or</Text>
                    <View className="flex-1 h-[1px] bg-gray-200 dark:bg-gray-700" />
                  </View>
                  <TouchableOpacity onPress={handleRenewSubscription} className="w-full bg-green-600 py-4 rounded-lg items-center justify-center shadow-lg">
                    <Text className="text-white font-bold text-lg">Renew Subscription</Text>
                  </TouchableOpacity>
                </>
              )}

              <View className="flex-row items-start justify-center px-2 mt-6">
                <Ionicons name="shield-checkmark" size={18} color="#9ca3af" style={{ marginTop: 2, marginRight: 8 }} />
                <Text className="text-sm text-gray-400 dark:text-gray-400 leading-relaxed flex-1">
                  We are fully committed to protecting your personal information and vehicle data. All data is encrypted, securely stored, and handled in strict compliance with the Nigeria Data Protection Commission (NDPC) guidelines. You can trust that your privacy remains our top priority.
                </Text>
              </View>
            </View>
          )}

          {/* Footer */}
          <View className="mt-8 pt-6 pb-2 border-t border-gray-200 dark:border-gray-700">
            <View className="items-center mb-4">
              <Text className="text-gray-500 dark:text-gray-400 text-sm font-semibold mb-2">Our Customer Support</Text>
              <View className="flex-row items-center justify-center gap-x-4">
                <TouchableOpacity 
                  onPress={() => Linking.openURL('tel:+2348076578993')}
                  className="flex-row items-center bg-gray-100 dark:bg-gray-700 py-2 px-4 rounded-full"
                >
                  <Ionicons name="call" size={16} color="#0d9488" style={{ marginRight: 6 }} />
                  <Text className="text-gray-700 dark:text-gray-200 font-medium text-sm">Call</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => Linking.openURL('https://wa.me/2348076578993')}
                  className="flex-row items-center bg-[#25D366]/10 dark:bg-[#25D366]/20 py-2 px-4 rounded-full"
                >
                  <FontAwesome name="whatsapp" size={16} color="#25D366" style={{ marginRight: 6 }} />
                  <Text className="text-[#25D366] dark:text-[#4ade80] font-medium text-sm">WhatsApp</Text>
                </TouchableOpacity>
              </View>
              <Text className="text-gray-400 dark:text-gray-500 font-medium text-xs mt-3">+234 807 657 8993</Text>
            </View>
            <View className="items-center mt-2">
              {userCount > 0 && (
                <Text className="text-pink-500 dark:text-pink-400 font-bold text-sm mb-2 tracking-wide">
                  Over <Text className="text-pink-800 dark:text-pink-200 text-base">{userCount}</Text> trusted users
                </Text>
              )}
              <Text className="text-gray-400 dark:text-gray-500 text-xs">© 2026 • Developed by</Text>
              <TouchableOpacity onPress={() => Linking.openURL('https://www.linkedin.com/in/michael-abaniwo/')}>
                <Text className="text-teal-700 dark:text-teal-400 font-semibold text-xs mt-1">DeuxM Technologies</Text>
              </TouchableOpacity>
            </View>
          </View>

        </View>

        <Modal visible={!!modalMessage} transparent animationType="fade">
          <View className="flex-1 justify-center items-center bg-black/50 px-4">
            <View className="bg-white dark:bg-gray-800 w-full max-w-sm p-6 rounded-2xl shadow-xl">
              <Text className="text-xl font-bold text-gray-900 dark:text-white mb-2">Login Issue</Text>
              <Text className="text-gray-600 dark:text-gray-300 mb-6">{modalMessage}</Text>
              {showRenewButton && (
                <TouchableOpacity onPress={handleRenewSubscription} className="w-full bg-green-600 py-3 rounded-lg mb-3 items-center">
                  <Text className="text-white font-bold">Renew Subscription</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => { setModalMessage(""); setShowRenewButton(false); }} className="w-full bg-blue-600 py-3 rounded-lg items-center">
                <Text className="text-white font-bold">Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </ScrollView>
    </SafeAreaView>
  );
}
