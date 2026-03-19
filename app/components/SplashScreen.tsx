import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

export default function SplashScreen() {
  const scale = useRef(new Animated.Value(0.9)).current;
  const translateY = useRef(new Animated.Value(10)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scale, translateY, textOpacity]);

  return (
    <View style={styles.container}>
      <View style={styles.gradientBackground} />
      <Animated.View
        style={[
          styles.content,
          {
            opacity: textOpacity,
            transform: [{ scale }, { translateY }],
          },
        ]}
      >
        <Text style={styles.brandPrefix}>my</Text>
        <Text style={styles.brandMain}>Split</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#3D1E72',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradientBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandPrefix: {
    fontSize: 32,
    fontWeight: '600',
    color: '#C9B4FF',
    marginRight: 4,
  },
  brandMain: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

