import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Image, Modal, TextInput, Alert, Platform, Vibration } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, setDoc, getDoc, collection, query, where, deleteDoc, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { UserProfile, Attendance } from "../types";
import QRCode from "react-native-qrcode-svg";
import QrScanner from "../components/QrScanner";
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotificationsAsync() {
  let token;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000, 500],
      lightColor: '#FF231F7C',
    });
  }
  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;
    try {
      const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId ?? "";
      token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {})).data;
    } catch (e) { console.log(e); }
  }
  return token;
}

export default function Dashboard() {
  const router = useRouter();
  const { colorScheme, toggleColorScheme } = useColorScheme();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<"Idle" | "Arrived" | "Departed">("Idle");
  const [scanning, setScanning] = useState(false);
  const [scanType, setScanType] = useState<"Arrival" | "Departure" | null>(null);
  const [showVehicleSelection, setShowVehicleSelection] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<{
    vehicleModel: string;
    vehicleColor: string;
    plate: string;
    stateOfRegistration: string;
  } | null>(null);
  const [activePlate, setActivePlate] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [currentArrival, setCurrentArrival] = useState("--");
  const [currentDeparture, setCurrentDeparture] = useState("--");
  const todayDate = new Date().toLocaleDateString();

  const [messages, setMessages] = useState<any[]>([]);
  const [scanError, setScanError] = useState("");
  const previousMessagesLength = React.useRef(0);

  const getFormattedDate = () => {
    const d = new Date();
    const day = d.getDate().toString().padStart(2, "0");
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  useEffect(() => {
    const init = async () => {
      const saved = await AsyncStorage.getItem("user");
      if (!saved) {
        router.replace("/");
        return;
      }
      const parsedUser: UserProfile = JSON.parse(saved);
      setUser(parsedUser);

      // Fetch org logo if missing
      if (!parsedUser.logoUrl && parsedUser.church) {
        getDocs(query(collection(db, "organizations"), where("churchName", "==", parsedUser.church))).then(snap => {
          if (!snap.empty) {
            const orgData = snap.docs[0].data();
            if (orgData.logoUrl) {
              const updatedUser = { ...parsedUser, logoUrl: orgData.logoUrl };
              setUser(updatedUser);
              AsyncStorage.setItem("user", JSON.stringify(updatedUser));
            }
          }
        });
      }

      getDoc(doc(db, "attendance", parsedUser.id)).then((snap) => {
        if (snap.exists()) {
          const data = snap.data() as Attendance;
          setStatus((data.status as "Idle" | "Arrived" | "Departed") ?? "Idle");
          setCurrentArrival(data.arrivalTimestamp || "--");
          setCurrentDeparture(data.departureTimestamp || "--");
          setActivePlate(data.plate || parsedUser.plate);
        } else {
          setActivePlate(parsedUser.plate);
        }
      });

      registerForPushNotificationsAsync().then(token => {
        if (token) {
          setDoc(doc(db, "users", parsedUser.id), { expoPushToken: token }, { merge: true });
        }
      });

      const msgQuery = query(collection(db, "messages"), where("userId", "==", parsedUser.id));
      const unsub = onSnapshot(msgQuery, (snap) => {
        const msgs = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
        setMessages(msgs);
        
        if (msgs.length > previousMessagesLength.current && msgs.length > 0) {
          Vibration.vibrate([1000, 1000, 1000, 1000], true);
        } else if (msgs.length === 0) {
          Vibration.cancel();
        }
        previousMessagesLength.current = msgs.length;
      });

      return () => unsub();
    };
    init();
  }, []);

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await deleteDoc(doc(db, "messages", messageId));
      Vibration.cancel();
    } catch (error) {
      console.error("Error deleting message:", error);
    }
  };

  const startScanProcess = (type: "Arrival" | "Departure") => {
    setScanType(type);
    if (user?.additionalVehicles && user.additionalVehicles.length > 0) {
      setShowVehicleSelection(true);
    } else {
      setSelectedVehicle(null);
      setScanning(true);
    }
  };

  const handleScan = async (data: string) => {
    if (isProcessing || !user) return;
    setIsProcessing(true);

    if (data !== `GATE|${user.church}`) {
      setScanError(`Access Denied: You are not registered with this organization / church on the app. Contact your admin for your specific QR Code!`);
      setScanning(false);
      setIsProcessing(false);
      return;
    }

    try {
      const now = new Date();
      const formattedDate = getFormattedDate();
      const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const isArrival = scanType === "Arrival";

      let attendanceData = { ...user };
      let finalPlate = user.plate;
      if (selectedVehicle) {
        attendanceData = {
          ...attendanceData,
          vehicleModel: selectedVehicle.vehicleModel,
          vehicleColor: selectedVehicle.vehicleColor,
          plate: selectedVehicle.plate,
          stateOfRegistration: selectedVehicle.stateOfRegistration,
        };
        finalPlate = selectedVehicle.plate;
      }

      if (isArrival) {
        await setDoc(doc(db, "attendance", user.id), {
          ...attendanceData,
          church: user.church,
          status: "Arrived",
          date: formattedDate,
          timestamp: now.toLocaleString(),
          arrivalTimestamp: timeStr,
          departureTimestamp: "",
        });
        setStatus("Arrived");
        setCurrentArrival(timeStr);
        setCurrentDeparture("--");
        setActivePlate(finalPlate);
        setShowWelcomeModal(true);
        setTimeout(() => setShowWelcomeModal(false), 6000);
      } else {
        await setDoc(doc(db, "attendance", user.id), {
          ...attendanceData,
          status: "Departed",
          departureTimestamp: timeStr,
        }, { merge: true });
        setStatus("Departed");
        setCurrentDeparture(timeStr);
        setActivePlate(finalPlate);
        setShowThankYou(true);
        setTimeout(() => setShowThankYou(false), 8000);
      }
      setScanning(false);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Error saving data");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdate = async () => {
    if (!user || isProcessing) return;
    setIsProcessing(true);
    try {
      await setDoc(doc(db, "users", user.id), user);
      await AsyncStorage.setItem("user", JSON.stringify(user));
      setIsEditing(false);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to update profile.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!user) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-gray-900">
        <ActivityIndicator size="large" color="#0f766e" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }} className="flex-1 bg-gray-100 dark:bg-gray-900 transition-colors">
      <ScrollView className="flex-1 bg-gray-100 dark:bg-gray-900 p-4">
      
      {/* Global Processing */}
      {isProcessing && (
        <View className="absolute z-50 top-0 left-0 right-0 bottom-0 bg-white/70 dark:bg-black/70 flex items-center justify-center">
          <View className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg items-center">
            <ActivityIndicator size="large" color="#0f766e" />
            <Text className="mt-4 font-bold text-gray-700 dark:text-gray-200">Processing...</Text>
          </View>
        </View>
      )}

      {/* Admin Messages */}
      <View className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm mb-6 border-l-4 border-teal-700">
        <Text className="font-bold text-lg text-teal-700 mb-4">Admin Messages</Text>
        <View className="max-h-40">
          <ScrollView nestedScrollEnabled>
            {messages.length === 0 && <Text className="text-gray-400 text-sm">No new messages.</Text>}
            {messages.map((m) => (
              <View key={m.id} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-l-4 border-blue-500 mb-2 relative pr-8">
                <TouchableOpacity onPress={() => handleDeleteMessage(m.id)} className="absolute top-2 right-2 p-2 z-10">
                  <Text className="text-gray-400 font-bold">✕</Text>
                </TouchableOpacity>
                <Text className="font-bold text-blue-900 dark:text-blue-200">Admin</Text>
                <Text className="text-black dark:text-gray-100">{m.text}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Header */}
      <View className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm mb-6 flex-row justify-between items-center border border-gray-200 dark:border-gray-700">
        <View className="flex-row items-center gap-4 flex-1">
          {user.logoUrl ? (
            <Image 
              source={{ uri: user.logoUrl }} 
              resizeMode="contain" 
              className="w-14 h-14 rounded-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800" 
            />
          ) : null}
          <View className="flex-1">
            <Text className="text-xs font-bold text-gray-400 uppercase tracking-widest">Organization / Church</Text>
            <Text className="text-xl font-black text-teal-700 dark:text-teal-400 flex-wrap">{user.church}</Text>
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
            onPress={async () => {
              await AsyncStorage.removeItem("user");
              await AsyncStorage.removeItem("status");
              router.replace("/");
            }}
            className="bg-red-50 dark:bg-red-900/30 px-4 py-1.5 rounded-lg border border-red-200 dark:border-red-800"
          >
            <Text className="text-red-600 dark:text-red-400 font-bold text-sm">Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Actions */}
      <View className="flex-row gap-4 mb-6">
        <TouchableOpacity
          onPress={() => startScanProcess("Arrival")}
          disabled={isProcessing}
          className="flex-1 bg-green-600 py-5 rounded-2xl items-center shadow-lg"
        >
          <Text className="text-white font-bold">Arrival</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => startScanProcess("Departure")}
          disabled={isProcessing}
          className="flex-1 bg-orange-500 py-5 rounded-2xl items-center shadow-lg"
        >
          <Text className="text-white font-bold">Departure</Text>
        </TouchableOpacity>
      </View>

      {/* Welcome Modal */}
      <Modal visible={showWelcomeModal} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center p-4">
          <View className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-2xl w-full max-w-md items-center border-t-4 border-teal-500">
            <View className="w-20 h-20 bg-teal-100 dark:bg-teal-900/40 rounded-full items-center justify-center mb-6">
              <Text className="text-4xl">👋</Text>
            </View>
            <Text className="text-2xl font-black text-gray-900 dark:text-white mb-2 text-center">
              Welcome to {user.church}!
            </Text>
            <Text className="text-gray-600 dark:text-gray-300 text-lg text-center">
              Your arrival has been recorded successfully. Have a wonderful time!
            </Text>
          </View>
        </View>
      </Modal>

      {/* Thank You Message */}
      {showThankYou && (
        <View className="bg-blue-600 p-6 rounded-2xl items-center mb-6 shadow-lg">
          <Text className="text-white font-bold mt-2 text-lg text-center">
            Thank you for coming to {user.church}. Enjoy the rest of your day. God bless you!
          </Text>
        </View>
      )}

      {/* E-Tag */}
      {(status === "Arrived" || status === "Departed") && (
        <View className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-md border-t-4 border-green-500 mb-6 relative">
          <View className={`absolute top-6 right-6 px-3 py-1 rounded-full ${status === "Arrived" ? "bg-green-100 dark:bg-green-900" : "bg-red-100 dark:bg-red-900"}`}>
            <Text className={`text-xs font-bold ${status === "Arrived" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>{status}</Text>
          </View>
          <Text className="font-bold text-black dark:text-white mb-4">Active Vehicle E-Tag</Text>
          <View className="flex-row items-center gap-4">
            <View className="bg-white p-2">
              <QRCode value={`${user.name}-${activePlate}`} size={100} />
            </View>
            <View className="flex-1 ml-2">
              <Text className="font-bold text-lg text-black dark:text-white">{user.name}</Text>
              <Text className="text-xs text-gray-400 font-bold uppercase">S/N: {user.id.slice(-8).toUpperCase()}</Text>
              <View className="mt-2">
                <Text className="text-xs text-gray-500 dark:text-gray-400 font-bold">Today - <Text className="text-black dark:text-white">{todayDate}</Text></Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400 font-bold">Arrival: <Text className="text-black dark:text-white">{currentArrival}</Text></Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400 font-bold">Departure: <Text className="text-black dark:text-white">{currentDeparture}</Text></Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Profile Section */}
      <View className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 mb-10">
        <View className="flex-row justify-between items-center mb-6">
          <Text className="font-bold text-lg text-black dark:text-white">My Profile</Text>
          <TouchableOpacity onPress={() => setIsEditing(!isEditing)} disabled={isProcessing} className="bg-blue-50 dark:bg-blue-900/30 px-4 py-2 rounded-lg">
            <Text className="text-teal-700 dark:text-teal-400 font-bold">{isEditing ? "Cancel" : "Edit Profile"}</Text>
          </TouchableOpacity>
        </View>

        {isEditing ? (
          <View className="space-y-4">
            {["church", "name", "phone", "vehicleModel", "vehicleColor", "plate", "stateOfRegistration", "occupants"].map((field) => (
              <View key={field} className="mb-3">
                <Text className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">
                  {field === "church" ? "Church / Organization" : field === "vehicleModel" ? "Vehicle Model" : field === "vehicleColor" ? "Vehicle Colour" : field === "stateOfRegistration" ? "State of Vehicle Registration" : field === "plate" ? "Vehicle Plate Number" : field}
                </Text>
                <TextInput
                  editable={!isProcessing && field !== "church"}
                  className="w-full border p-3 rounded-lg text-black dark:text-white bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                  value={(user as any)[field] || ""}
                  onChangeText={(text) => setUser({ ...user, [field]: text })}
                />
              </View>
            ))}

            {/* Additional Vehicles Editing */}
            {user.additionalVehicles?.map((vehicle, index) => (
              <View key={`edit-vehicle-${index}`} className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg mb-4">
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="font-bold text-sm text-gray-700 dark:text-gray-300">Additional Vehicle {index + 1}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      const updated = [...(user.additionalVehicles || [])];
                      updated.splice(index, 1);
                      setUser({ ...user, additionalVehicles: updated });
                    }}
                  >
                    <Text className="text-red-500 text-xs font-bold">Remove</Text>
                  </TouchableOpacity>
                </View>

                {/* Additional Vehicle Fields */}
                <View className="space-y-3">
                  <View className="mb-2">
                    <Text className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Vehicle Model</Text>
                    <TextInput
                      className="w-full border p-3 rounded-lg text-black dark:text-white bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                      value={vehicle.vehicleModel}
                      onChangeText={(text) => {
                        const updated = [...(user.additionalVehicles || [])];
                        updated[index].vehicleModel = text;
                        setUser({ ...user, additionalVehicles: updated });
                      }}
                    />
                  </View>
                  <View className="mb-2">
                    <Text className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Vehicle Colour</Text>
                    <TextInput
                      className="w-full border p-3 rounded-lg text-black dark:text-white bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                      value={vehicle.vehicleColor}
                      onChangeText={(text) => {
                        const updated = [...(user.additionalVehicles || [])];
                        updated[index].vehicleColor = text;
                        setUser({ ...user, additionalVehicles: updated });
                      }}
                    />
                  </View>
                  <View className="mb-2">
                    <Text className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Vehicle Plate Number</Text>
                    <TextInput
                      className="w-full border p-3 rounded-lg text-black dark:text-white bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                      value={vehicle.plate}
                      onChangeText={(text) => {
                        const updated = [...(user.additionalVehicles || [])];
                        updated[index].plate = text;
                        setUser({ ...user, additionalVehicles: updated });
                      }}
                    />
                  </View>
                  <View className="mb-2">
                    <Text className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">State of Vehicle Registration</Text>
                    <TextInput
                      className="w-full border p-3 rounded-lg text-black dark:text-white bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                      value={vehicle.stateOfRegistration}
                      onChangeText={(text) => {
                        const updated = [...(user.additionalVehicles || [])];
                        updated[index].stateOfRegistration = text;
                        setUser({ ...user, additionalVehicles: updated });
                      }}
                    />
                  </View>
                </View>
              </View>
            ))}

            <TouchableOpacity
              onPress={() => {
                setUser({
                  ...user,
                  additionalVehicles: [
                    ...(user.additionalVehicles || []),
                    { vehicleModel: "", vehicleColor: "", plate: "", stateOfRegistration: "" }
                  ]
                });
              }}
              className="w-full border-2 border-dashed border-teal-500 py-3 rounded-lg items-center mt-2"
            >
              <Text className="text-teal-700 dark:text-teal-400 font-bold">+ Add Another Vehicle</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleUpdate} disabled={isProcessing} className="bg-teal-700 py-3 rounded-lg items-center mt-4 shadow-lg">
              <Text className="text-white font-bold">{isProcessing ? "Saving..." : "Save Changes"}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="flex-row flex-wrap">
            {Object.entries(user).map(([key, value]) => (
              key !== "id" && key !== "logoUrl" && key !== "expoPushToken" && key !== "additionalVehicles" && (
                <View key={key} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg w-full mb-3 border border-gray-100 dark:border-gray-600 shadow-sm">
                  <Text className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">
                    {key === "church" ? "Church / Organization" : key === "vehicleModel" ? "Vehicle Model" : key === "vehicleColor" ? "Vehicle Colour" : key === "stateOfRegistration" ? "State of Vehicle Registration" : key === "plate" ? "Vehicle Plate Number" : key}
                  </Text>
                  <Text className="text-black dark:text-white font-semibold mt-1">{value as string}</Text>
                </View>
              )
            ))}

            {/* View Additional Vehicles */}
            {user.additionalVehicles?.map((vehicle, index) => (
              <View key={`view-vehicle-${index}`} className="w-full p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 mt-2 mb-2">
                <Text className="text-sm text-teal-700 dark:text-teal-400 uppercase font-bold mb-3 border-b border-gray-200 dark:border-gray-600 pb-2">
                  Additional Vehicle {index + 1}
                </Text>
                <View className="space-y-3">
                  <View>
                    <Text className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">Vehicle Model</Text>
                    <Text className="text-black dark:text-white font-semibold mt-1">{vehicle.vehicleModel || "N/A"}</Text>
                  </View>
                  <View>
                    <Text className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">Vehicle Colour</Text>
                    <Text className="text-black dark:text-white font-semibold mt-1">{vehicle.vehicleColor || "N/A"}</Text>
                  </View>
                  <View>
                    <Text className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">Vehicle Plate Number</Text>
                    <Text className="text-black dark:text-white font-semibold mt-1">{vehicle.plate || "N/A"}</Text>
                  </View>
                  <View>
                    <Text className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">State of Vehicle Registration</Text>
                    <Text className="text-black dark:text-white font-semibold mt-1">{vehicle.stateOfRegistration || "N/A"}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Vehicle Selection Modal */}
      <Modal visible={showVehicleSelection} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center p-4">
          <View className="bg-white dark:bg-gray-800 p-6 rounded-2xl max-h-[80%]">
            <Text className="font-bold text-center text-lg mb-4 text-gray-900 dark:text-white">
              Select Vehicle for {scanType}
            </Text>
            <ScrollView className="space-y-3">
              <TouchableOpacity
                onPress={() => {
                  setSelectedVehicle(null);
                  setShowVehicleSelection(false);
                  setScanning(true);
                }}
                className="w-full p-4 border border-teal-500 rounded-xl mb-3"
              >
                <Text className="font-bold text-teal-700 dark:text-teal-400">Primary Vehicle</Text>
                <Text className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  {user.vehicleModel} ({user.vehicleColor}) - {user.plate}
                </Text>
              </TouchableOpacity>

              {user.additionalVehicles?.map((v, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => {
                    setSelectedVehicle(v);
                    setShowVehicleSelection(false);
                    setScanning(true);
                  }}
                  className="w-full p-4 border border-gray-300 dark:border-gray-600 rounded-xl mb-3"
                >
                  <Text className="font-bold text-gray-800 dark:text-gray-200">Additional Vehicle {idx + 1}</Text>
                  <Text className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {v.vehicleModel} ({v.vehicleColor}) - {v.plate}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              onPress={() => setShowVehicleSelection(false)}
              className="w-full mt-4 py-3 bg-gray-200 dark:bg-gray-700 rounded-xl items-center"
            >
              <Text className="text-gray-800 dark:text-white font-bold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Scanner Modal */}
      <Modal visible={scanning} transparent animationType="slide">
        <View className="flex-1 bg-black p-6 pt-20">
          <View className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-2xl flex-1 max-h-[80%]">
            <Text className="text-center font-bold mb-4 text-black dark:text-white text-lg">Scan Gate QR for {scanType}</Text>
            <View className="flex-1 justify-center items-center">
              <QrScanner onScanAction={handleScan} scanType={scanType} />
            </View>
            <TouchableOpacity onPress={() => setScanning(false)} className="mt-8 items-center py-4 bg-gray-200 dark:bg-gray-700 rounded-xl">
              <Text className="text-gray-800 dark:text-gray-200 font-bold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Error Modal */}
      <Modal visible={!!scanError} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center p-4">
          <View className="bg-white dark:bg-gray-800 p-6 rounded-2xl w-full max-w-sm">
            <View className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Text className="text-2xl">⚠️</Text>
            </View>
            <Text className="text-red-600 dark:text-red-400 font-bold text-center text-lg mb-2">Access Denied</Text>
            <Text className="text-gray-600 dark:text-gray-300 text-center mb-6">{scanError}</Text>
            <TouchableOpacity onPress={() => setScanError("")} className="w-full py-3 bg-red-600 rounded-xl items-center">
              <Text className="text-white font-bold">Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
    </SafeAreaView>
  );
}
