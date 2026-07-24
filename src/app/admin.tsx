import React, { useEffect, useState, useRef } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Modal, TextInput, FlatList, Share, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { db } from "../lib/firebase";
import { collection, onSnapshot, getDocs, writeBatch, query, where, addDoc, serverTimestamp, updateDoc, doc } from "firebase/firestore";
import QRCode from "react-native-qrcode-svg";
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from "expo-web-browser";
import ViewShot from "react-native-view-shot";
import { Attendance } from "../types";

export default function AdminPage() {
  const router = useRouter();
  const { colorScheme, toggleColorScheme } = useColorScheme();
  const [adminChurch, setAdminChurch] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [orgLogo, setOrgLogo] = useState("");
  const [isRenewing, setIsRenewing] = useState(false);
  const [logs, setLogs] = useState<Attendance[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Attendance | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [newAccessCode, setNewAccessCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(true);
  const [isExpiredModalOpen, setIsExpiredModalOpen] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(true);

  const qrRef = useRef<any>(null);

  useEffect(() => {
    const initAdmin = async () => {
      const storedChurch = await AsyncStorage.getItem("adminChurch");
      if (!storedChurch) {
        router.replace("/");
        return;
      }
      
      const qOrg = query(collection(db, "organizations"), where("churchName", "==", storedChurch));
      const orgSnap = await getDocs(qOrg);

      if (orgSnap.empty) {
        await AsyncStorage.removeItem("adminChurch");
        router.replace("/");
        return;
      }

      const orgData = orgSnap.docs[0].data();
      setAdminEmail(orgData.email || "admin@vehicle-security.app");
      if (orgData.logoUrl) setOrgLogo(orgData.logoUrl);

      const isExempt = storedChurch === "RCCG The Oasis" || orgData.isFree === true;

      if (!isExempt) {
        const expiryDate = orgData.expiryDate?.toDate ? orgData.expiryDate.toDate() : (orgData.expiryDate ? new Date(orgData.expiryDate) : null);
        if (!expiryDate || isNaN(expiryDate.getTime()) || new Date() > expiryDate) {
          setIsSubscribed(false);
          setIsExpiredModalOpen(true);
          setIsVerifying(false);
          return;
        }
      }

      setAdminChurch(storedChurch);
      setIsVerifying(false);
      setIsSubscribed(true);

      const qLogs = query(collection(db, "attendance"), where("church", "==", storedChurch));
      const unsub = onSnapshot(qLogs, (snap) => {
        setLogs(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Attendance));
      });

      return () => unsub();
    };

    initAdmin();
  }, []);

  const handleLogout = async () => {
    await AsyncStorage.removeItem("adminChurch");
    router.replace("/");
  };

  const downloadGateSign = async (type: "Arrival" | "Departure") => {
    if (qrRef.current && qrRef.current.capture) {
      try {
        const uri = await qrRef.current.capture();
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { dialogTitle: `Share Gate ${type} QR` });
        } else {
          Alert.alert("Sharing not available", "Cannot share QR code on this device");
        }
      } catch (err) {
        console.error("Failed to capture QR:", err);
        Alert.alert("Error", "Could not capture the QR Code");
      }
    }
  };

  const handleExportPDF = async () => {
    try {
      const rows = logs.map(log => `
        <tr>
          <td>${log.name || ""}</td>
          <td>${log.vehicleModel || ""}</td>
          <td>${log.plate || ""}</td>
          <td>${log.status || ""}</td>
          <td>${log.arrivalTimestamp || "--"}</td>
          <td>${log.departureTimestamp || "--"}</td>
        </tr>
      `).join("");

      const html = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; }
              h1 { text-align: center; color: #0f766e; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f2f2f2; color: #333; }
            </style>
          </head>
          <body>
            <h1>${adminChurch} Attendance Report</h1>
            <p>Generated on: ${new Date().toLocaleDateString()}</p>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Vehicle</th>
                  <th>Plate</th>
                  <th>Status</th>
                  <th>Arrival</th>
                  <th>Departure</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri);
      } else {
        Alert.alert("Success", `PDF generated at ${uri}`);
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to generate PDF");
    }
  };

  const handleClearAll = async () => {
    if (!adminChurch) return;
    setIsClearing(true);
    try {
      const q = query(collection(db, "attendance"), where("church", "==", adminChurch));
      const querySnapshot = await getDocs(q);
      const batch = writeBatch(db);
      querySnapshot.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      setShowConfirmModal(false);
      Alert.alert("Success", "All attendance records cleared.");
    } catch (error) {
      console.error("Error clearing data:", error);
      Alert.alert("Error", "Failed to clear data.");
    } finally {
      setIsClearing(false);
    }
  };

  const handleRenewSubscription = async () => {
    if (isRenewing) return;
    setIsRenewing(true);
    try {
      const res = await fetch(`https://tishmor.com/api/initiate-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tx_ref: `RENEW-${Date.now()}`,
          meta: { orgName: adminChurch, isRenewal: true, email: adminEmail },
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
    } finally {
      setIsRenewing(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    const query = searchQuery.toLowerCase();
    return (
      log.name?.toLowerCase().includes(query) ||
      log.vehicleModel?.toLowerCase().includes(query) ||
      log.plate?.toLowerCase().includes(query)
    );
  });

  if (isVerifying) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-100">
        <ActivityIndicator size="large" color="#0f766e" />
        <Text className="mt-4 text-gray-600 font-bold">Verifying details...</Text>
      </View>
    );
  }

  const renderLogItem = ({ item }: { item: Attendance }) => (
    <TouchableOpacity onPress={() => { setSelectedUser(item); setIsDetailsModalOpen(true); }} activeOpacity={0.7} className="bg-white dark:bg-gray-800 p-4 mb-3 rounded-xl shadow-sm border-l-4 border-teal-600">
      <View className="flex-row justify-between items-start mb-2">
        <View>
          <Text className="font-bold text-xl text-black dark:text-white">{item.name}</Text>
          <Text className="text-base text-gray-500 dark:text-gray-400">{item.vehicleModel} • {item.plate}</Text>
        </View>
        <View className="items-end gap-y-2">
          <View className={`px-4 py-1.5 rounded-full ${item.status === "Arrived" ? "bg-green-700 dark:bg-green-600" : "bg-red-700 dark:bg-red-600"}`}>
            <Text className="text-sm font-bold text-white">{item.status}</Text>
          </View>
          <TouchableOpacity onPress={() => { setSelectedUser(item); setIsMessageModalOpen(true); }} className="bg-teal-700 dark:bg-teal-600 px-4 py-2 rounded-lg shadow-sm">
            <Text className="text-sm font-bold text-white">Message</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View className="flex-row justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
        <Text className="text-sm text-gray-600 dark:text-gray-300 font-bold">In: {item.arrivalTimestamp || "--"}</Text>
        <Text className="text-sm text-gray-600 dark:text-gray-300 font-bold">Out: {item.departureTimestamp || "--"}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-gray-100 dark:bg-gray-900">
      <ScrollView className="flex-1 p-4" nestedScrollEnabled={true}>
        
        {/* Header Dashboard section */}
        <View className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm mb-6 flex-row justify-between items-center border border-gray-200 dark:border-gray-700">
          <View className="flex-row items-center gap-3">
            {orgLogo ? (
              <Image source={{ uri: orgLogo }} resizeMode="contain" className="w-12 h-12 rounded-full border border-gray-200 dark:border-gray-600 bg-white" />
            ) : null}
            <View>
              <Text className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase">Admin Portal</Text>
              <Text className="text-xl font-black text-teal-700 dark:text-teal-400">{adminChurch}</Text>
            </View>
          </View>
          <View className="flex-col items-end gap-3">
            <TouchableOpacity 
              onPress={toggleColorScheme} 
              className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full"
            >
              <Ionicons 
                name={colorScheme === "dark" ? "moon" : "sunny"} 
                size={20} 
                color={colorScheme === "dark" ? "#60a5fa" : "#f59e0b"} 
              />
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={handleLogout}
              className="bg-red-50 dark:bg-red-900/30 px-4 py-1.5 rounded-lg border border-red-200 dark:border-red-800"
            >
              <Text className="text-red-600 dark:text-red-400 font-bold text-sm">Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* QR Scanner Component representation */}
        <View className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm items-center justify-center mb-6">
          <Text className="font-bold text-gray-800 dark:text-white mb-4">Gate Scanner QR</Text>
          <ViewShot ref={qrRef} options={{ format: "jpg", quality: 0.9 }}>
            <View className="bg-white p-4">
              <QRCode value={`GATE|${adminChurch}`} size={200} />
            </View>
          </ViewShot>
          <View className="flex-row gap-4 mt-6">
            <TouchableOpacity onPress={() => downloadGateSign("Arrival")} className="bg-teal-600 px-4 py-3 rounded-lg flex-1 items-center">
              <Text className="text-white font-bold text-xs text-center">Share Arrival QR</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => downloadGateSign("Departure")} className="bg-teal-800 px-4 py-3 rounded-lg flex-1 items-center">
              <Text className="text-white font-bold text-xs text-center">Share Departure QR</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Action Buttons */}
        <View className="bg-teal-800 dark:bg-teal-950 p-6 rounded-2xl shadow-lg mb-6 flex-row flex-wrap gap-3 justify-center">
          <TouchableOpacity onPress={() => setIsCodeModalOpen(true)} className="bg-amber-500 px-4 py-3 rounded-lg flex-1 min-w-[120px] items-center">
            <Text className="text-white font-bold text-xs text-center">Change Code</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleExportPDF} className="bg-emerald-600 px-4 py-3 rounded-lg flex-1 min-w-[120px] items-center">
            <Text className="text-white font-bold text-xs text-center">Export PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowConfirmModal(true)} className="bg-red-500 px-4 py-3 rounded-lg flex-1 min-w-[120px] items-center">
            <Text className="text-white font-bold text-xs text-center">Clear Data</Text>
          </TouchableOpacity>
          {adminChurch !== "RCCG The Oasis" && (
            <TouchableOpacity onPress={handleRenewSubscription} className="bg-blue-600 px-4 py-3 rounded-lg flex-1 min-w-[120px] items-center">
              <Text className="text-white font-bold text-xs text-center">Renew Sub</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* FlatList embedded in ScrollView (logs) */}
        <View className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm mb-10 min-h-[400px]">
          <Text className="font-bold text-lg mb-4 text-black dark:text-white">Attendance Logs ({filteredLogs.length})</Text>
          <TextInput
            placeholder="Search by name, plate, or vehicle..."
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-black dark:text-white mb-4 bg-gray-50 dark:bg-gray-700"
          />
          {filteredLogs.length === 0 ? (
            <Text className="text-center text-gray-500 dark:text-gray-400 py-10">No records found.</Text>
          ) : (
            <FlatList
              data={filteredLogs}
              keyExtractor={(item) => item.id}
              renderItem={renderLogItem}
              scrollEnabled={false} // Since we are inside a ScrollView
            />
          )}
        </View>
      </ScrollView>

      {/* Modals */}
      <Modal visible={isExpiredModalOpen} transparent animationType="fade">
        <View className="flex-1 bg-black/80 justify-center items-center p-4">
          <View className="bg-white dark:bg-gray-800 p-8 rounded-2xl w-full max-w-sm border-4 border-red-500">
            <Text className="text-2xl font-black text-red-600 dark:text-red-400 mb-4 text-center">Subscription Expired</Text>
            <Text className="text-gray-700 dark:text-gray-300 mb-6 text-center">Your access has expired. Please renew your subscription to continue.</Text>
            <TouchableOpacity onPress={handleRenewSubscription} disabled={isRenewing} className={`w-full py-4 rounded-xl items-center ${isRenewing ? "bg-blue-400" : "bg-blue-600"}`}>
              <Text className="text-white font-bold">{isRenewing ? "Redirecting..." : "Renew Subscription"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} className="mt-4 py-2 items-center">
              <Text className="text-red-500 dark:text-red-400 font-bold">Logout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showConfirmModal} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center p-4">
          <View className="bg-white dark:bg-gray-800 p-6 rounded-2xl w-full max-w-sm shadow-2xl">
            <Text className="text-xl font-bold text-gray-900 dark:text-white mb-4 text-center">Clear All Data?</Text>
            <Text className="text-gray-600 dark:text-gray-400 mb-6 text-center">This action cannot be undone. All attendance records will be deleted.</Text>
            <View className="flex-row gap-4">
              <TouchableOpacity onPress={() => setShowConfirmModal(false)} disabled={isClearing} className="flex-1 bg-gray-200 dark:bg-gray-700 py-3 rounded-lg items-center">
                <Text className="font-bold text-gray-800 dark:text-white">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleClearAll} disabled={isClearing} className="flex-1 bg-red-600 py-3 rounded-lg items-center">
                <Text className="font-bold text-white">{isClearing ? "Clearing..." : "Clear"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isCodeModalOpen} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center p-4">
          <View className="bg-white dark:bg-gray-800 p-6 rounded-2xl w-full max-w-sm shadow-2xl">
            <Text className="text-xl font-bold text-gray-900 dark:text-white mb-4">Change Access Code</Text>
            <TextInput
              secureTextEntry
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg mb-3 text-black dark:text-white bg-gray-50 dark:bg-gray-700"
              placeholder="New Access Code"
              placeholderTextColor="#9ca3af"
              value={newAccessCode}
              onChangeText={setNewAccessCode}
            />
            <TextInput
              secureTextEntry
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg mb-6 text-black dark:text-white bg-gray-50 dark:bg-gray-700"
              placeholder="Confirm New Code"
              placeholderTextColor="#9ca3af"
              value={confirmCode}
              onChangeText={setConfirmCode}
            />
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => setIsCodeModalOpen(false)} className="flex-1 bg-gray-200 dark:bg-gray-700 py-3 rounded-lg items-center">
                <Text className="font-bold text-gray-800 dark:text-white">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={async () => {
                if (newAccessCode !== confirmCode || newAccessCode.length < 4) {
                  Alert.alert("Error", "Codes must match and be at least 4 chars.");
                  return;
                }
                try {
                  const q = query(collection(db, "organizations"), where("churchName", "==", adminChurch));
                  const snapshot = await getDocs(q);
                  if (!snapshot.empty) {
                    await updateDoc(doc(db, "organizations", snapshot.docs[0].id), { adminPasscode: newAccessCode });
                    Alert.alert("Success", "Code updated. Please log in again.");
                    setIsCodeModalOpen(false);
                    handleLogout();
                  }
                } catch (e) {
                  Alert.alert("Error", "Failed to update code.");
                }
              }} className="flex-1 bg-blue-600 py-3 rounded-lg items-center">
                <Text className="font-bold text-white">Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={isMessageModalOpen} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center p-4">
          <View className="bg-white dark:bg-gray-800 p-6 rounded-2xl w-full max-w-sm shadow-2xl">
            <Text className="text-xl font-bold text-gray-900 dark:text-white mb-2">Send Message</Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mb-4">To: {selectedUser?.name}</Text>
            <TextInput
              multiline
              numberOfLines={4}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg mb-6 text-black dark:text-white bg-gray-50 dark:bg-gray-700"
              placeholder="Enter your message..."
              placeholderTextColor="#9ca3af"
              value={messageText}
              onChangeText={setMessageText}
              textAlignVertical="top"
            />
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => { setIsMessageModalOpen(false); setMessageText(""); }} className="flex-1 bg-gray-200 dark:bg-gray-700 py-3 rounded-lg items-center">
                <Text className="font-bold text-gray-800 dark:text-white">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={async () => {
                if (!messageText.trim() || !selectedUser) return;
                try {
                  // Add message to Firestore
                  await addDoc(collection(db, "messages"), {
                    userId: selectedUser.id,
                    text: messageText,
                    timestamp: serverTimestamp(),
                  });
                  
                  // Fetch user push token
                  const q = query(collection(db, "users"), where("id", "==", selectedUser.id));
                  const userSnap = await getDocs(q);
                  if (!userSnap.empty) {
                    const userData = userSnap.docs[0].data();
                    if (userData.expoPushToken) {
                      await fetch("https://exp.host/--/api/v2/push/send", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          to: userData.expoPushToken,
                          title: "Message from Admin",
                          body: messageText,
                          sound: null,
                          channelId: "default",
                          priority: "high"
                        })
                      });
                    }
                  }
                  
                  Alert.alert("Sent", "Message sent successfully!");
                  setIsMessageModalOpen(false);
                  setMessageText("");
                } catch (e) {
                  Alert.alert("Error", "Failed to send message.");
                }
              }} className="flex-1 bg-blue-600 py-3 rounded-lg items-center">
                <Text className="font-bold text-white">Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Details Modal */}
      <Modal visible={isDetailsModalOpen} transparent animationType="slide">
        <View className="flex-1 bg-black/60 justify-end">
          <View className="bg-white dark:bg-gray-800 p-6 rounded-t-3xl h-[80%] shadow-xl">
            <View className="flex-row justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
              <Text className="text-2xl font-black text-gray-900 dark:text-white">Full Details</Text>
              <TouchableOpacity onPress={() => setIsDetailsModalOpen(false)} className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full">
                <Text className="text-gray-500 dark:text-gray-300 font-bold">✕</Text>
              </TouchableOpacity>
            </View>
            
            {selectedUser && (
              <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
                <View className="gap-y-4 pb-10">
                  <View className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl">
                    <Text className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Name</Text>
                    <Text className="text-lg font-bold text-gray-900 dark:text-white">{selectedUser.name}</Text>
                  </View>
                  
                  <View className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl">
                    <Text className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Church / Organization</Text>
                    <Text className="text-lg font-bold text-gray-900 dark:text-white">{selectedUser.church}</Text>
                  </View>
                  
                  <View className="flex-row gap-4">
                    <View className="flex-1 bg-gray-50 dark:bg-gray-900 p-4 rounded-xl">
                      <Text className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Phone Number</Text>
                      <Text className="text-base font-medium text-gray-900 dark:text-white">{selectedUser.phone}</Text>
                    </View>
                    <View className="flex-1 bg-gray-50 dark:bg-gray-900 p-4 rounded-xl">
                      <Text className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Occupants</Text>
                      <Text className="text-base font-medium text-gray-900 dark:text-white">{selectedUser.occupants}</Text>
                    </View>
                  </View>
                  
                  <View className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl">
                    <Text className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Vehicle Details</Text>
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-sm font-medium text-gray-500 dark:text-gray-400">Model:</Text>
                      <Text className="text-sm font-bold text-gray-900 dark:text-white">{selectedUser.vehicleModel}</Text>
                    </View>
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-sm font-medium text-gray-500 dark:text-gray-400">Color:</Text>
                      <Text className="text-sm font-bold text-gray-900 dark:text-white">{selectedUser.vehicleColor}</Text>
                    </View>
                    <View className="flex-row justify-between mb-2">
                      <Text className="text-sm font-medium text-gray-500 dark:text-gray-400">Plate:</Text>
                      <Text className="text-sm font-bold text-blue-600 dark:text-blue-400 font-mono">{selectedUser.plate}</Text>
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-sm font-medium text-gray-500 dark:text-gray-400">State:</Text>
                      <Text className="text-sm font-bold text-gray-900 dark:text-white">{selectedUser.stateOfRegistration}</Text>
                    </View>
                  </View>

                  <View className="flex-row gap-4">
                    <View className="flex-1 bg-green-50 dark:bg-green-900/20 p-4 rounded-xl border border-green-100 dark:border-green-800/30">
                      <Text className="text-xs font-bold text-green-600 dark:text-green-500 uppercase tracking-wider mb-1">Arrival Time</Text>
                      <Text className="text-base font-bold text-green-700 dark:text-green-400">{selectedUser.arrivalTimestamp || "--"}</Text>
                    </View>
                    <View className="flex-1 bg-red-50 dark:bg-red-900/20 p-4 rounded-xl border border-red-100 dark:border-red-800/30">
                      <Text className="text-xs font-bold text-red-600 dark:text-red-500 uppercase tracking-wider mb-1">Departure Time</Text>
                      <Text className="text-base font-bold text-red-700 dark:text-red-400">{selectedUser.departureTimestamp || "--"}</Text>
                    </View>
                  </View>
                  
                  <View className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl flex-row justify-between items-center">
                    <Text className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Current Status</Text>
                    <View className={`px-4 py-1.5 rounded-full ${selectedUser.status === "Arrived" ? "bg-green-700" : "bg-red-700"}`}>
                      <Text className="text-sm font-bold text-white">{selectedUser.status}</Text>
                    </View>
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
