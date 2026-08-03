import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  Easing 
} from "react-native-reanimated";
import Svg, { Path, Rect } from "react-native-svg";

export default function VehicleScannerAnimation() {
  const progress = useSharedValue(0); // 0 to 1 over 12s

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 14000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const carStyle = useAnimatedStyle(() => {
    let translateX = -200;
    let scaleX = 1;
    const p = progress.value;

    if (p < 0.166) {
      // Arrival: Left to Center
      translateX = -200 + (p / 0.166) * 200;
      scaleX = 1;
    } else if (p < 0.333) {
      // Arrival: Scan at Center
      translateX = 0;
      scaleX = 1;
    } else if (p < 0.5) {
      // Arrival: Center to Right (Leaves)
      translateX = ((p - 0.333) / 0.167) * 200;
      scaleX = 1;
    } else if (p < 0.666) {
      // Departure: Right to Center (Returns)
      translateX = 200 - ((p - 0.5) / 0.166) * 200;
      scaleX = -1;
    } else if (p < 0.833) {
      // Departure: Scan at Center
      translateX = 0;
      scaleX = -1;
    } else {
      // Departure: Center to Left (Leaves)
      translateX = -((p - 0.833) / 0.167) * 200;
      scaleX = -1;
    }

    return {
      transform: [{ translateX }, { scaleX }],
    };
  });

  const scannerStyle = useAnimatedStyle(() => {
    let opacity = 0;
    let translateX = -30;
    const p = progress.value;
    
    if (p >= 0.166 && p < 0.333) {
      const sp = (p - 0.166) / 0.167; // 0 to 1
      opacity = 1;
      translateX = -30 + Math.abs(Math.sin(sp * Math.PI * 4)) * 60;
    } else if (p >= 0.666 && p < 0.833) {
      const sp = (p - 0.666) / 0.167; // 0 to 1
      opacity = 1;
      translateX = -30 + Math.abs(Math.sin(sp * Math.PI * 4)) * 60;
    }

    return {
      opacity,
      transform: [{ translateX }],
    };
  });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.carContainer, carStyle]}>
        <Svg width="120" height="60" viewBox="0 0 100 50">
          {/* Car body */}
          <Path d="M10 35 L10 20 L30 10 L70 10 L90 20 L90 35 Z" fill="#0d9488" />
          {/* Wheels */}
          <Rect x="20" y="30" width="15" height="15" rx="7.5" fill="#1e293b" />
          <Rect x="65" y="30" width="15" height="15" rx="7.5" fill="#1e293b" />
          {/* Windows */}
          <Path d="M35 12 L65 12 L65 20 L35 20 Z" fill="#94a3b8" />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.scanner, scannerStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: 100,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    position: "relative",
  },
  carContainer: {
    position: "absolute",
    left: "50%",
    marginLeft: -60, // Half of new width (120)
  },
  scanner: {
    position: "absolute",
    width: 6,
    height: 80,
    backgroundColor: "#2dd4bf",
    shadowColor: "#2dd4bf",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 5,
    borderRadius: 3,
  }
});
