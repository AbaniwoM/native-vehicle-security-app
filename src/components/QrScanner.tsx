import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

interface Props {
  onScanAction: (data: string) => void;
  scanType?: "Arrival" | "Departure" | null;
}

export default function QrScanner({ onScanAction, scanType }: Props) {
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  if (!permission) {
    // Camera permissions are still loading.
    return <View />;
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet.
    return (
      <View className="items-center justify-center space-y-4 py-8">
        <Text className="text-center font-semibold text-gray-700">We need your permission to show the camera</Text>
        <TouchableOpacity 
          onPress={requestPermission}
          className="bg-blue-600 px-6 py-3 rounded-lg"
        >
          <Text className="text-white font-bold">Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleBarcodeScanned = ({ type, data }: { type: string; data: string }) => {
    if (scanned) return;
    setScanned(true);
    setIsScanning(false);
    onScanAction(data);
  };

  const toggleCameraFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  return (
    <View className="w-full max-w-sm mx-auto space-y-4">
      {/* UI Header */}
      {scanType && (
        <View className="items-center mb-2">
          <View className={`px-4 py-2 rounded-full ${scanType === "Arrival" ? "bg-green-100" : "bg-orange-100"}`}>
            <Text className={`text-xs font-bold uppercase tracking-widest ${scanType === "Arrival" ? "text-green-700" : "text-orange-700"}`}>
              {scanType === "Arrival" ? "🚗 Arrival Mode" : "🚘 Departure Mode"}
            </Text>
          </View>
        </View>
      )}

      {/* The Scanner View Container */}
      <View className="w-full aspect-square overflow-hidden rounded-3xl border-4 border-blue-500 bg-gray-900 justify-center items-center">
        {isScanning ? (
          <CameraView 
            style={StyleSheet.absoluteFill} 
            facing={facing} 
            onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ["qr"],
            }}
          />
        ) : (
          <Text className="text-gray-400 font-bold">Scanner Stopped</Text>
        )}
      </View>

      {/* Control Buttons */}
      <View className="flex-row justify-between mt-4 gap-3">
        {!isScanning ? (
          <TouchableOpacity
            onPress={() => { setScanned(false); setIsScanning(true); }}
            className="flex-1 py-4 bg-blue-600 rounded-xl items-center shadow-lg"
          >
            <Text className="text-white font-bold">Start Scanner</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              onPress={() => setIsScanning(false)}
              className="flex-1 py-3 bg-red-600 rounded-xl items-center justify-center"
            >
              <Text className="text-white font-bold">Stop</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={toggleCameraFacing}
              className="flex-1 py-3 bg-gray-200 rounded-xl items-center justify-center"
            >
              <Text className="text-gray-800 font-bold">Flip Camera</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}
