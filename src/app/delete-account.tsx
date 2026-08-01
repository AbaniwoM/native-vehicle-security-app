import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile } from '../types';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      const savedUser = await AsyncStorage.getItem("user");
      if (savedUser) {
        setUser(JSON.parse(savedUser));
      } else {
        router.replace("/");
      }
    };
    fetchUser();
  }, []);

  const handleDeleteRequest = async () => {
    if (!user || isLoading) return;
    setIsLoading(true);

    try {
      // Generate request ID
      const requestId = `del_${user.id}_${Date.now()}`;
      
      const docRef = doc(db, 'deletionRequests', requestId);
      await setDoc(docRef, {
        id: requestId,
        userId: user.id,
        name: user.name,
        email: user.email || 'N/A',
        phone: user.phone,
        church: user.church,
        status: 'Pending',
        timestamp: serverTimestamp()
      });

      // Format WhatsApp message
      const whatsappNumber = "2348076578993";
      const whatsappMessage = `Hello Admin, I have requested to delete my account.\nName: ${user.name}\nEmail: ${user.email || 'N/A'}\nPhone: ${user.phone}\nChurch: ${user.church}`;
      const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`;
      
      try {
        const canOpen = await Linking.canOpenURL(whatsappUrl);
        if (canOpen) {
          await Linking.openURL(whatsappUrl);
        } else {
          // Attempt to open anyway if canOpenURL fails on some devices
          await Linking.openURL(whatsappUrl);
        }
      } catch (err) {
        console.error("Could not open WhatsApp", err);
      }

      setIsSuccess(true);
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Could not submit deletion request. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return <View className="flex-1 bg-white dark:bg-gray-900" />;

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-gray-900">
      <View className="flex-row items-center p-4 border-b border-gray-200 dark:border-gray-800">
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="#0f766e" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-900 dark:text-white">Delete Account</Text>
      </View>

      <ScrollView className="flex-1 p-6">
        {isSuccess ? (
          <View className="items-center py-10">
            <Ionicons name="checkmark-circle" size={80} color="#10b981" />
            <Text className="text-2xl font-bold text-gray-900 dark:text-white mt-4 text-center">Request Submitted</Text>
            <Text className="text-gray-600 dark:text-gray-300 text-center mt-2 text-base px-4 leading-relaxed">
              Your account deletion request has been received. Our admin team will process this request within 3-5 business days.
            </Text>
            <TouchableOpacity 
              onPress={() => router.replace("/dashboard")} 
              className="mt-8 bg-teal-600 px-8 py-3 rounded-xl"
            >
              <Text className="text-white font-bold text-lg">Return to Dashboard</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <View className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl border border-red-200 dark:border-red-800 mb-6 flex-row">
              <Ionicons name="warning" size={24} color="#dc2626" />
              <View className="ml-3 flex-1">
                <Text className="text-red-800 dark:text-red-400 font-bold text-lg">Warning</Text>
                <Text className="text-red-700 dark:text-red-300 mt-1">
                  This action cannot be undone. Once your account is deleted, all your data, including vehicle profiles and gate access history, will be permanently removed.
                </Text>
              </View>
            </View>

            <Text className="text-gray-800 dark:text-gray-200 font-medium mb-4 text-base">
              By proceeding, you agree that:
            </Text>
            
            <View className="space-y-3 mb-8">
              <View className="flex-row">
                <Text className="text-gray-500 mr-2">•</Text>
                <Text className="text-gray-600 dark:text-gray-400 flex-1">You will lose access to the Tishmor App.</Text>
              </View>
              <View className="flex-row">
                <Text className="text-gray-500 mr-2">•</Text>
                <Text className="text-gray-600 dark:text-gray-400 flex-1">Your registered vehicles will no longer be tracked under this account.</Text>
              </View>
              <View className="flex-row">
                <Text className="text-gray-500 mr-2">•</Text>
                <Text className="text-gray-600 dark:text-gray-400 flex-1">A request will be sent to the admin, who will process the final deletion.</Text>
              </View>
            </View>

            <TouchableOpacity 
              onPress={() => {
                Alert.alert(
                  "Confirm Deletion Request",
                  "Are you sure you want to submit a request to delete your account?",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Yes, Delete My Account", style: "destructive", onPress: handleDeleteRequest }
                  ]
                );
              }}
              disabled={isLoading}
              className={`w-full py-4 rounded-xl items-center ${isLoading ? 'bg-red-300' : 'bg-red-600'}`}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-bold text-lg">Submit Deletion Request</Text>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity 
              onPress={() => router.back()} 
              disabled={isLoading}
              className="w-full py-4 rounded-xl items-center mt-4 bg-gray-200 dark:bg-gray-800"
            >
              <Text className="text-gray-800 dark:text-gray-300 font-bold text-lg">Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
