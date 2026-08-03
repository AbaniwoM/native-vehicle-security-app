'use no memo';
import React, { useEffect, useState, useRef } from "react";
import { Pressable, View, Text, ScrollView, ActivityIndicator, Alert, Modal, TextInput, Image, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
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
import { Attendance, DeletionRequest } from "../types";
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

export default function AdminPage() {
  const router = useRouter();
  const { colorScheme, setColorScheme } = useColorScheme();
  const [themeSelection, setThemeSelection] = useState<"light" | "dark" | "system">("system");
  const [adminChurch, setAdminChurch] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [orgLogo, setOrgLogo] = useState("");
  const [isRenewing, setIsRenewing] = useState(false);
  const [logs, setLogs] = useState<Attendance[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentTime, setCurrentTime] = useState("");
  const [currentDate, setCurrentDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [deletionRequests, setDeletionRequests] = useState<DeletionRequest[]>([]);
  const [showDeletionRequestsModal, setShowDeletionRequestsModal] = useState(false);
  
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
  const [, setIsSubscribed] = useState(true);
  const [isNotifyAllModalOpen, setIsNotifyAllModalOpen] = useState(false);
  const [notifyAllMessageText, setNotifyAllMessageText] = useState("");

  const qrRef = useRef<any>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour12: false }));
      setCurrentDate(now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase());
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const initAdmin = async () => {
      const storedChurch = await AsyncStorage.getItem("adminChurch");
      if (!storedChurch) {
        setTimeout(() => router.replace("/"), 100);
        return;
      }
      
      const qOrg = query(collection(db, "organizations"), where("churchName", "==", storedChurch));
      const orgSnap = await getDocs(qOrg);

      if (orgSnap.empty) {
        await AsyncStorage.removeItem("adminChurch");
        setTimeout(() => router.replace("/"), 100);
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

      const qRequests = query(collection(db, "deletionRequests"), where("church", "==", storedChurch));
      const unsubReq = onSnapshot(qRequests, (snap) => {
        setDeletionRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as DeletionRequest));
      });

      return () => {
        unsub();
        unsubReq();
      };
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

  const handleUpdateDeletionStatus = async (reqId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, "deletionRequests", reqId), { status: newStatus });
      Alert.alert("Success", `Request marked as ${newStatus}`);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to update request status.");
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

  const handleNotifyAll = async () => {
    if (!notifyAllMessageText.trim() || !adminChurch) return;
    try {
      // Find all users who arrived today for this church
      const q = query(
        collection(db, "attendance"),
        where("church", "==", adminChurch),
        where("status", "==", "Arrived"),
        where("date", "==", new Date().toLocaleDateString())
      );
      const snap = await getDocs(q);
      
      let sentCount = 0;
      const promises = snap.docs.map(async (docSnap) => {
        const attendanceData = docSnap.data();
        const userId = docSnap.id;
        
        await addDoc(collection(db, "messages"), {
          userId,
          text: notifyAllMessageText,
          timestamp: serverTimestamp(),
        });
        
        // Fetch user push token
        const userQ = query(collection(db, "users"), where("id", "==", userId));
        const userSnap = await getDocs(userQ);
        if (!userSnap.empty) {
          const userData = userSnap.docs[0].data();
          if (userData.expoPushToken) {
            await fetch("https://exp.host/--/api/v2/push/send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: userData.expoPushToken,
                title: "General Message from Admin",
                body: notifyAllMessageText,
                sound: "default",
                channelId: "default",
                priority: "high"
              })
            });
          }
        }
        sentCount++;
      });
      
      await Promise.all(promises);
      Alert.alert("Success", `Message sent to ${sentCount} users.`);
      setIsNotifyAllModalOpen(false);
      setNotifyAllMessageText("");
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to send notify all message.");
    }
  };

  const filteredLogs = logs.filter((log) => {
    const query = searchQuery.toLowerCase();
    return (
      log.name?.toLowerCase().includes(query) ||
      log.vehicleModel?.toLowerCase().includes(query) ||
      log.plate?.toLowerCase().includes(query) ||
      log.date?.toLowerCase().includes(query) ||
      log.timestamp?.toLowerCase().includes(query)
    );
  });

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const groupedLogs = paginatedLogs.reduce((acc, log) => {
    const dateKey = log.date || "Unknown Date";
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(log);
    return acc;
  }, {} as Record<string, Attendance[]>);

  const sortedDates = Object.keys(groupedLogs).sort((a, b) => {
    if (a === "Unknown Date") return 1;
    if (b === "Unknown Date") return -1;
    const partsA = a.split("/");
    const partsB = b.split("/");
    if (partsA.length === 3 && partsB.length === 3) {
      const dateA = new Date(`${partsA[2]}-${partsA[1]}-${partsA[0]}`).getTime();
      const dateB = new Date(`${partsB[2]}-${partsB[1]}-${partsB[0]}`).getTime();
      return dateB - dateA;
    }
    return 0;
  });

  if (isVerifying) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-100">
        <ActivityIndicator size="large" color="#0f766e" />
        <Text className="mt-4 text-gray-600 font-bold">Verifying details...</Text>
      </View>
    );
  }

  const renderLogItem = ({ item, index }: { item: Attendance; index: number }) => (
    <TouchableOpacity onPress={() => { setSelectedUser(item); setIsDetailsModalOpen(true); }} activeOpacity={0.7} className={`p-4 mb-3 rounded-xl shadow-sm border-l-4 border-teal-600 ${index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-1 mr-2">
          <Text className="font-bold text-xl text-black dark:text-white flex-wrap" numberOfLines={2}>{item.name}</Text>
          <Text className="text-base text-gray-500 dark:text-gray-400 flex-wrap" numberOfLines={2}>{item.vehicleModel} • {item.plate}</Text>
        </View>
        <View className="items-end gap-y-2 flex-shrink-0">
          <View className={`px-4 py-1.5 rounded-full ${item.status === "Arrived" ? "bg-green-700 dark:bg-green-600" : "bg-red-700 dark:bg-red-600"}`}>
            <Text className="text-sm font-bold text-white">{item.status}</Text>
          </View>
          <Pressable onPress={() => { setSelectedUser(item); setIsMessageModalOpen(true); }} className="bg-teal-700 dark:bg-teal-600 px-4 py-2 rounded-lg shadow-sm">
            <Text className="text-sm font-bold text-white">Message</Text>
          </Pressable>
        </View>
      </View>
      <View className="flex-row justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-600">
        <Text className="text-sm text-gray-600 dark:text-gray-300 font-bold">In: {item.arrivalTimestamp || "--"}</Text>
        <Text className="text-sm text-gray-600 dark:text-gray-300 font-bold">Out: {item.departureTimestamp || "--"}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-100 dark:bg-gray-900">
      <ScrollView className="flex-1 p-4" nestedScrollEnabled={true}>
        
        {/* Gate Scanner Section */}
        <View className="bg-[#111827] rounded-[32px] p-6 mb-6">
          <View className="flex-row items-center justify-between mb-6">
            <View className="w-28" />
            <Text className="text-white font-bold text-lg">Gate Scanner</Text>
            <View className="flex-row items-center bg-[#1f2937] rounded-full p-1.5 w-28 justify-between">
              <Pressable onPress={() => { setColorScheme('light'); setThemeSelection('light'); }} className={`p-2 rounded-full ${themeSelection === 'light' ? 'bg-[#374151]' : ''}`}>
                <Ionicons name="sunny" size={18} color={themeSelection === 'light' ? '#fff' : '#6b7280'} />
              </Pressable>
              <Pressable onPress={() => { setColorScheme('system'); setThemeSelection('system'); }} className={`p-2 rounded-full ${themeSelection === 'system' ? 'bg-[#374151]' : ''}`}>
                <Ionicons name="desktop-outline" size={18} color={themeSelection === 'system' ? '#fff' : '#6b7280'} />
              </Pressable>
              <Pressable onPress={() => { setColorScheme('dark'); setThemeSelection('dark'); }} className={`p-2 rounded-full ${themeSelection === 'dark' ? 'bg-[#374151]' : ''}`}>
                <Ionicons name="moon" size={18} color={themeSelection === 'dark' ? '#fff' : '#6b7280'} />
              </Pressable>
            </View>
          </View>
          
          <View className="items-center mb-8">
            <ViewShot ref={qrRef} options={{ format: "jpg", quality: 0.9 }}>
              <View className="bg-white p-4 rounded-3xl">
                <QRCode value={`https://tishmor.com/?data=${encodeURIComponent(`GATE|${adminChurch}`)}`} size={240} />
              </View>
            </ViewShot>
          </View>
          
          <View className="flex-row gap-2">
            <Pressable onPress={() => downloadGateSign("Arrival")} className="bg-[#0f766e] flex-1 py-4 px-2 rounded-xl items-center justify-center shadow-md">
              <Text className="text-white font-bold text-sm text-center" adjustsFontSizeToFit numberOfLines={1}>Download Arrival QR</Text>
            </Pressable>
            <Pressable onPress={() => downloadGateSign("Departure")} className="bg-[#0f766e] flex-1 py-4 px-2 rounded-xl items-center justify-center shadow-md">
              <Text className="text-white font-bold text-sm text-center" adjustsFontSizeToFit numberOfLines={1}>Download Departure QR</Text>
            </Pressable>
          </View>
        </View>

        {/* Security Dashboard Section */}
        <View className="bg-[#0f766e] rounded-[32px] p-6 mb-6 shadow-lg">
          <View className="flex-row flex-wrap justify-between gap-y-3 mb-8">
            <Pressable onPress={() => setIsCodeModalOpen(true)} className="w-[48%] bg-[#f59e0b] py-2.5 px-3 rounded-xl items-center shadow-sm">
              <Text className="text-white font-bold text-sm">Change Access Code</Text>
            </Pressable>
            <Pressable onPress={handleExportPDF} className="w-[48%] bg-[#10b981] py-2.5 px-3 rounded-xl items-center shadow-sm">
              <Text className="text-white font-bold text-sm">Export PDF</Text>
            </Pressable>
            <Pressable onPress={() => setIsNotifyAllModalOpen(true)} className="w-[48%] bg-[#a855f7] py-2.5 px-3 rounded-xl items-center shadow-sm">
              <Text className="text-white font-bold text-sm">Notify All</Text>
            </Pressable>
            <Pressable onPress={() => setShowConfirmModal(true)} className="w-[48%] bg-[#ef4444] py-2.5 px-3 rounded-xl items-center shadow-sm">
              <Text className="text-white font-bold text-sm">Clear All Data</Text>
            </Pressable>
            <Pressable onPress={() => setShowDeletionRequestsModal(true)} className="w-[48%] bg-[#ef4444] py-2.5 px-3 rounded-xl items-center shadow-sm relative">
              <Text className="text-white font-bold text-sm text-center">Deletion Requests</Text>
              {deletionRequests.filter(req => req.status === "Pending").length > 0 ? (
                <View className="absolute -top-2 -right-2 bg-white rounded-full w-6 h-6 items-center justify-center shadow-md">
                  <Text className="text-red-600 text-xs font-bold">{deletionRequests.filter(req => req.status === "Pending").length}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable onPress={handleLogout} className="w-[48%] bg-[#64748b] py-2.5 px-3 rounded-xl items-center shadow-sm">
              <Text className="text-white font-bold text-sm">Logout</Text>
            </Pressable>
            {adminChurch !== "RCCG The Oasis" ? (
              <Pressable onPress={handleRenewSubscription} className="w-full mt-1 bg-blue-600 py-2.5 px-3 rounded-xl items-center shadow-sm">
                <Text className="text-white font-bold text-sm">Renew Subscription</Text>
              </Pressable>
            ) : null}
          </View>

          <View className="flex-row items-center gap-3 mb-4">
            {orgLogo ? (
              <Image source={{ uri: orgLogo }} resizeMode="contain" className="w-10 h-10 rounded-full bg-white shadow-sm" />
            ) : (
              <View className="w-10 h-10 rounded-full bg-white items-center justify-center shadow-sm">
                <Text className="text-teal-700 font-bold text-lg">{adminChurch.charAt(0)}</Text>
              </View>
            )}
            <Text className="text-white font-bold tracking-widest uppercase text-sm">{adminChurch}</Text>
          </View>

          <Text className="text-white font-black text-4xl mb-3 tracking-tight">Security Dashboard</Text>
          <Text className="text-white text-base mb-8">
            Active vehicles inside: <Text className="font-bold text-lg">{logs.filter(l => l.status === "Arrived" && l.date === new Date().toLocaleDateString()).length}</Text>
          </Text>

          <Text className="text-white font-black text-4xl mb-2">{currentTime}</Text>
          <Text className="text-white/90 uppercase font-bold tracking-widest text-sm">{currentDate}</Text>
        </View>

        {/* Content Area */}
        <View className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm mb-10 min-h-[400px]">
          <Text className="font-bold text-lg mb-4 text-black dark:text-white">Attendance Logs ({filteredLogs.length})</Text>
          <TextInput
            placeholder="Search by name, plate, vehicle, or date..."
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              setCurrentPage(1);
            }}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-black dark:text-white mb-4 bg-gray-50 dark:bg-gray-700"
          />
          {filteredLogs.length === 0 ? (
            <Text className="text-center text-gray-500 dark:text-gray-400 py-10">No records found.</Text>
          ) : (
            <View>
              {sortedDates.map((dateKey) => (
                <View key={dateKey} className="mb-4">
                  <View className="bg-gray-100 dark:bg-gray-700 py-2 px-4 rounded-lg mb-3">
                    <Text className="font-bold text-gray-700 dark:text-gray-200 uppercase tracking-widest text-xs">
                      {dateKey}
                    </Text>
                  </View>
                  {groupedLogs[dateKey].map((item, index) => (
                    <React.Fragment key={item.id}>
                      {renderLogItem({ item, index })}
                    </React.Fragment>
                  ))}
                </View>
              ))}

              {filteredLogs.length > ITEMS_PER_PAGE && (
                <View className="flex-row justify-between items-center mt-6 mb-4">
                  <Pressable 
                    disabled={currentPage === 1}
                    onPress={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className={`px-4 py-2 rounded-lg ${currentPage === 1 ? 'bg-gray-200 dark:bg-gray-700' : 'bg-teal-600 dark:bg-teal-700'}`}
                  >
                    <Text className={`font-bold ${currentPage === 1 ? 'text-gray-400 dark:text-gray-500' : 'text-white'}`}>Previous</Text>
                  </Pressable>
                  <Text className="text-gray-600 dark:text-gray-300 font-bold">
                    Page {currentPage} of {totalPages}
                  </Text>
                  <Pressable 
                    disabled={currentPage === totalPages}
                    onPress={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className={`px-4 py-2 rounded-lg ${currentPage === totalPages ? 'bg-gray-200 dark:bg-gray-700' : 'bg-teal-600 dark:bg-teal-700'}`}
                  >
                    <Text className={`font-bold ${currentPage === totalPages ? 'text-gray-400 dark:text-gray-500' : 'text-white'}`}>Next</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Modals */}
      <Modal visible={showDeletionRequestsModal} transparent animationType="fade">
        <View className="flex-1 bg-black/60 justify-center items-center p-4">
          <View className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80%]">
            <View className="flex-row justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
              <Text className="text-2xl font-bold text-gray-900 dark:text-white">Account Deletion Requests</Text>
              <Pressable onPress={() => setShowDeletionRequestsModal(false)} className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full">
                <Text className="text-gray-500 dark:text-gray-300 font-bold">✕</Text>
              </Pressable>
            </View>
            
            <ScrollView showsVerticalScrollIndicator={false}>
              {deletionRequests.length === 0 ? (
                <Text className="text-center text-gray-500 dark:text-gray-400 py-8">No pending deletion requests.</Text>
              ) : (
                <View className="gap-y-4 pb-4">
                  {deletionRequests.map((req) => (
                    <View key={req.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50 dark:bg-gray-900/50">
                      <View className="flex-row justify-between items-start mb-2">
                        <Text className="font-bold text-lg text-gray-900 dark:text-white">{req.name}</Text>
                        <View className={`px-3 py-1 rounded-full ${req.status === 'Deleted' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'}`}>
                          <Text className="text-xs font-bold">{req.status}</Text>
                        </View>
                      </View>
                      <View className="flex-row flex-wrap gap-x-4 gap-y-2 text-sm mt-2">
                        <Text className="text-gray-600 dark:text-gray-300"><Text className="font-semibold text-gray-500 dark:text-gray-400">Phone:</Text> {req.phone}</Text>
                        <Text className="text-gray-600 dark:text-gray-300"><Text className="font-semibold text-gray-500 dark:text-gray-400">Email:</Text> {req.email}</Text>
                        <Text className="text-gray-600 dark:text-gray-300 w-full"><Text className="font-semibold text-gray-500 dark:text-gray-400">User ID:</Text> {req.userId || req.id}</Text>
                      </View>

                      {req.status === 'Pending' && (
                        <View className="flex-row gap-3 mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                          <Pressable onPress={() => handleUpdateDeletionStatus(req.id!, 'Resolved')} className="bg-teal-600 px-4 py-2 rounded-lg flex-1 items-center">
                            <Text className="text-white font-bold text-sm">Mark Resolved</Text>
                          </Pressable>
                          <Pressable onPress={() => handleUpdateDeletionStatus(req.id!, 'Deleted')} className="bg-red-600 px-4 py-2 rounded-lg flex-1 items-center">
                            <Text className="text-white font-bold text-sm">Mark Deleted</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
            
            <View className="mt-6 flex-row justify-end">
              <Pressable onPress={() => setShowDeletionRequestsModal(false)} className="px-6 py-3 rounded-lg bg-gray-200 dark:bg-gray-700 items-center">
                <Text className="font-bold text-gray-900 dark:text-white">Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={isExpiredModalOpen} transparent animationType="fade">
        <View className="flex-1 bg-black/80 justify-center items-center p-4">
          <View className="bg-white dark:bg-gray-800 p-8 rounded-2xl w-full max-w-sm border-4 border-red-500">
            <Text className="text-2xl font-black text-red-600 dark:text-red-400 mb-4 text-center">Subscription Expired</Text>
            <Text className="text-gray-700 dark:text-gray-300 mb-6 text-center">Your access has expired. Please renew your subscription to continue.</Text>
            <Pressable onPress={handleRenewSubscription} disabled={isRenewing} className={`w-full py-4 rounded-xl items-center ${isRenewing ? "bg-blue-400" : "bg-blue-600"}`}>
              <Text className="text-white font-bold">{isRenewing ? "Redirecting..." : "Renew Subscription"}</Text>
            </Pressable>
            <Pressable onPress={handleLogout} className="mt-4 py-2 items-center">
              <Text className="text-red-500 dark:text-red-400 font-bold">Logout</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showConfirmModal} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center p-4">
          <View className="bg-white dark:bg-gray-800 p-6 rounded-2xl w-full max-w-sm shadow-2xl">
            <Text className="text-xl font-bold text-gray-900 dark:text-white mb-4 text-center">Clear All Data?</Text>
            <Text className="text-gray-600 dark:text-gray-400 mb-6 text-center">This action cannot be undone. All attendance records will be deleted.</Text>
            <View className="flex-row gap-4">
              <Pressable onPress={() => setShowConfirmModal(false)} disabled={isClearing} className="flex-1 bg-gray-200 dark:bg-gray-700 py-3 rounded-lg items-center">
                <Text className="font-bold text-gray-800 dark:text-white">Cancel</Text>
              </Pressable>
              <Pressable onPress={handleClearAll} disabled={isClearing} className="flex-1 bg-red-600 py-3 rounded-lg items-center">
                <Text className="font-bold text-white">{isClearing ? "Clearing..." : "Clear"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Notify All Modal */}
      <Modal visible={isNotifyAllModalOpen} transparent animationType="fade">
        <View className="flex-1 bg-black/60 justify-center items-center p-4">
          <BlurView intensity={80} tint={colorScheme === "dark" ? "dark" : "light"} className="p-6 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden border border-white/20">
            <View className="flex-row items-center mb-4 border-b border-gray-200/50 dark:border-gray-700/50 pb-4">
              <Ionicons name="notifications" size={24} color="#0d9488" style={{ marginRight: 8 }} />
              <Text className="text-xl font-bold text-gray-900 dark:text-white">Notify All</Text>
            </View>
            <Text className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              This message will be sent to ALL users who have an "Arrived" status today.
            </Text>
            <TextInput
              multiline
              numberOfLines={4}
              className="w-full p-4 border border-teal-500/30 rounded-xl mb-6 text-black dark:text-white bg-white/50 dark:bg-black/20"
              placeholder="Enter your general message..."
              placeholderTextColor="#9ca3af"
              value={notifyAllMessageText}
              onChangeText={setNotifyAllMessageText}
              textAlignVertical="top"
            />
            <View className="flex-row gap-3">
              <Pressable onPress={() => { setIsNotifyAllModalOpen(false); setNotifyAllMessageText(""); }} className="flex-1 bg-gray-200/80 dark:bg-gray-700/80 py-3 rounded-xl items-center">
                <Text className="font-bold text-gray-800 dark:text-white">Cancel</Text>
              </Pressable>
              <Pressable onPress={handleNotifyAll} className="flex-1 bg-teal-600 py-3 rounded-xl items-center shadow-lg">
                <Text className="font-bold text-white">Send All</Text>
              </Pressable>
            </View>
          </BlurView>
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
              <Pressable onPress={() => setIsCodeModalOpen(false)} className="flex-1 bg-gray-200 dark:bg-gray-700 py-3 rounded-lg items-center">
                <Text className="font-bold text-gray-800 dark:text-white">Cancel</Text>
              </Pressable>
              <Pressable onPress={async () => {
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
                } catch {
                  Alert.alert("Error", "Failed to update code.");
                }
              }} className="flex-1 bg-blue-600 py-3 rounded-lg items-center">
                <Text className="font-bold text-white">Update</Text>
              </Pressable>
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
              <Pressable onPress={() => { setIsMessageModalOpen(false); setMessageText(""); }} className="flex-1 bg-gray-200 dark:bg-gray-700 py-3 rounded-lg items-center">
                <Text className="font-bold text-gray-800 dark:text-white">Cancel</Text>
              </Pressable>
              <Pressable onPress={async () => {
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
                          sound: "default",
                          channelId: "default",
                          priority: "high"
                        })
                      });
                    }
                  }
                  
                  Alert.alert("Sent", "Message sent successfully!");
                  setIsMessageModalOpen(false);
                  setMessageText("");
                } catch {
                  Alert.alert("Error", "Failed to send message.");
                }
              }} className="flex-1 bg-blue-600 py-3 rounded-lg items-center">
                <Text className="font-bold text-white">Send</Text>
              </Pressable>
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
              <Pressable onPress={() => setIsDetailsModalOpen(false)} className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full">
                <Text className="text-gray-500 dark:text-gray-300 font-bold">✕</Text>
              </Pressable>
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
