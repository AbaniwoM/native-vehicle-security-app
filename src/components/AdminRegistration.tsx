import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, Image } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db, storage } from "../lib/firebase";
import { collection, doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export default function AdminRegistration() {
  const [orgName, setOrgName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [email, setEmail] = useState("");
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      setLogoUri(result.assets[0].uri);
    }
  };

  const handleRegister = async () => {
    if (!orgName || !passcode || !email) {
      Alert.alert("Missing Fields", "Please fill in all required fields.");
      return;
    }

    setIsLoading(true);
    const orgId = orgName.toLowerCase().replace(/\s+/g, "-");
    const isFree = orgName.trim().toLowerCase() === "rccg the oasis";
    let logoUrl = "";

    if (logoUri) {
      try {
        const response = await fetch(logoUri);
        const blob = await response.blob();
        const storageRef = ref(storage, `organizations/logos/${orgId}-${Date.now()}`);
        await uploadBytes(storageRef, blob);
        logoUrl = await getDownloadURL(storageRef);
      } catch (err) {
        console.error("Logo upload failed:", err);
        Alert.alert("Error", "Logo upload failed. Please try again.");
        setIsLoading(false);
        return;
      }
    }

    if (isFree) {
      try {
        await setDoc(doc(db, "organizations", orgId), {
          churchName: orgName,
          adminPasscode: passcode,
          logoUrl: logoUrl,
          isFree: true,
          status: "active",
          email: email,
          expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 10)),
        });
        await AsyncStorage.setItem("adminChurch", orgName);
        router.replace("/admin");
      } catch (e) {
        Alert.alert("Registration Error", "Failed to register.");
        setIsLoading(false);
      }
    } else {
      try {
        const baseUrl = process.env.EXPO_PUBLIC_BASE_URL || "https://vehicle-security.app";
        const res = await fetch(`${baseUrl}/api/initiate-payment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: "100",
            tx_ref: `REG-${orgId}-${Date.now()}`,
            meta: {
              orgId: orgId,
              orgName: orgName,
              passcode: passcode,
              email: email,
              logoUrl: logoUrl,
            },
          }),
        });

        const data = await res.json();
        if (data.payment_link) {
          await WebBrowser.openBrowserAsync(data.payment_link);
          setIsLoading(false);
        } else {
          Alert.alert("Payment Error", "Failed to initiate payment. Please try again.");
          setIsLoading(false);
        }
      } catch (error) {
        Alert.alert("Network Error", "Could not connect to payment server.");
        setIsLoading(false);
      }
    }
  };

  return (
    <View className="mt-2">
      <View className="mb-4">
        <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Organization / Church Name</Text>
        <TextInput
          placeholder="e.g. RCCG The Oasis"
          placeholderTextColor="#9ca3af"
          value={orgName}
          onChangeText={setOrgName}
          editable={!isLoading}
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-black dark:text-white dark:bg-gray-800"
        />
      </View>
      <View className="mb-4">
        <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</Text>
        <TextInput
          placeholder="admin@church.com"
          placeholderTextColor="#9ca3af"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!isLoading}
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-black dark:text-white dark:bg-gray-800"
        />
      </View>

      <View className="mb-4">
        <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Organization Logo (Optional)</Text>
        <TouchableOpacity onPress={pickImage} disabled={isLoading} className="bg-teal-50 dark:bg-teal-900/30 py-3 rounded-lg border border-teal-100 dark:border-teal-800 items-center mb-2">
          <Text className="text-teal-700 dark:text-teal-400 font-semibold">{logoUri ? "Change Image" : "Select Image"}</Text>
        </TouchableOpacity>
        {logoUri && <Image source={{ uri: logoUri }} className="w-16 h-16 rounded-lg self-center" />}
      </View>

      <View className="relative mb-4">
        <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Admin Access Code</Text>
        <TextInput
          placeholder="Create a secure Access Code"
          placeholderTextColor="#9ca3af"
          value={passcode}
          onChangeText={setPasscode}
          secureTextEntry={!showPassword}
          editable={!isLoading}
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-black dark:text-white dark:bg-gray-800 pr-12"
        />
        <TouchableOpacity className="absolute right-4 top-9" onPress={() => setShowPassword(!showPassword)}>
          <Text>{showPassword ? "👁️" : "🙈"}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={handleRegister}
        disabled={isLoading}
        className={`w-full py-4 rounded-lg items-center justify-center mt-4 ${isLoading ? "bg-gray-400" : "bg-teal-700"}`}
      >
        {isLoading ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator color="#fff" />
            <Text className="text-white font-bold">Registering...</Text>
          </View>
        ) : (
          <Text className="text-white font-bold text-lg">Register & Pay</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
