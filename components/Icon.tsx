import React from 'react';
import { View, StyleSheet } from 'react-native';

export type IconName =
  | 'dashboard'
  | 'collect'
  | 'sol'
  | 'history'
  | 'scan'
  | 'print'
  | 'check'
  | 'clock'
  | 'alert'
  | 'crown'
  | 'user'
  | 'users'
  | 'phone'
  | 'calendar'
  | 'cash'
  | 'sync'
  | 'search'
  | 'arrow-right'
  | 'arrow-left'
  | 'close'
  | 'plus'
  | 'filter'
  | 'target'
  | 'shield';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: any;
}

export const Icon: React.FC<IconProps> = ({
  name,
  size = 20,
  color = '#0F172A',
  style,
}) => {
  const half = size / 2;
  const stroke = Math.max(1.5, Math.round(size / 10));

  switch (name) {
    case 'dashboard':
      // 4-grid squares icon
      return (
        <View style={[{ width: size, height: size, justifyContent: 'space-between' }, style]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', height: half - 2 }}>
            <View style={{ width: half - 2, backgroundColor: color, borderRadius: 2 }} />
            <View style={{ width: half - 2, backgroundColor: color, borderRadius: 2 }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', height: half - 2 }}>
            <View style={{ width: half - 2, backgroundColor: color, borderRadius: 2 }} />
            <View style={{ width: half - 2, backgroundColor: color, borderRadius: 2 }} />
          </View>
        </View>
      );

    case 'collect':
      // Lightning bolt icon
      return (
        <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
          <View
            style={{
              width: stroke * 2,
              height: size * 0.5,
              backgroundColor: color,
              borderRadius: 1,
              transform: [{ rotate: '25deg' }, { translateY: -2 }],
            }}
          />
          <View
            style={{
              width: stroke * 2,
              height: size * 0.5,
              backgroundColor: color,
              borderRadius: 1,
              transform: [{ rotate: '25deg' }, { translateY: 2 }, { translateX: -2 }],
            }}
          />
        </View>
      );

    case 'sol':
      // Circular rotation arrows
      return (
        <View
          style={[
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: stroke,
              borderColor: color,
              borderTopColor: 'transparent',
              justifyContent: 'center',
              alignItems: 'center',
            },
            style,
          ]}
        >
          <View
            style={{
              position: 'absolute',
              top: 0,
              right: stroke,
              width: stroke * 2,
              height: stroke * 2,
              backgroundColor: color,
              borderRadius: stroke,
            }}
          />
        </View>
      );

    case 'history':
      // Clock / List history icon
      return (
        <View
          style={[
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: stroke,
              borderColor: color,
              alignItems: 'center',
              justifyContent: 'center',
            },
            style,
          ]}
        >
          <View
            style={{
              position: 'absolute',
              top: size * 0.22,
              width: stroke,
              height: size * 0.3,
              backgroundColor: color,
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: size * 0.45,
              top: size * 0.45,
              width: size * 0.25,
              height: stroke,
              backgroundColor: color,
            }}
          />
        </View>
      );

    case 'scan':
      // QR Scanner frame icon
      return (
        <View style={[{ width: size, height: size, justifyContent: 'space-between' }, style]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ width: stroke * 3, height: stroke * 3, borderColor: color, borderTopWidth: stroke, borderLeftWidth: stroke }} />
            <View style={{ width: stroke * 3, height: stroke * 3, borderColor: color, borderTopWidth: stroke, borderRightWidth: stroke }} />
          </View>
          <View style={{ alignSelf: 'center', width: size * 0.6, height: stroke, backgroundColor: color }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ width: stroke * 3, height: stroke * 3, borderColor: color, borderBottomWidth: stroke, borderLeftWidth: stroke }} />
            <View style={{ width: stroke * 3, height: stroke * 3, borderColor: color, borderBottomWidth: stroke, borderRightWidth: stroke }} />
          </View>
        </View>
      );

    case 'print':
      // Printer icon
      return (
        <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
          <View style={{ width: size * 0.6, height: size * 0.25, backgroundColor: color, borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
          <View style={{ width: size * 0.9, height: size * 0.4, borderWidth: stroke, borderColor: color, borderRadius: 3, backgroundColor: 'transparent' }} />
          <View style={{ width: size * 0.6, height: size * 0.25, backgroundColor: color, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 }} />
        </View>
      );

    case 'check':
      // Checkmark icon
      return (
        <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
          <View
            style={{
              width: size * 0.35,
              height: size * 0.6,
              borderBottomWidth: stroke * 1.5,
              borderRightWidth: stroke * 1.5,
              borderColor: color,
              transform: [{ rotate: '45deg' }, { translateY: -size * 0.1 }],
            }}
          />
        </View>
      );

    case 'clock':
      return (
        <View
          style={[
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: stroke,
              borderColor: color,
              alignItems: 'center',
              justifyContent: 'center',
            },
            style,
          ]}
        >
          <View style={{ width: stroke, height: size * 0.3, backgroundColor: color, position: 'absolute', top: size * 0.2 }} />
          <View style={{ width: size * 0.25, height: stroke, backgroundColor: color, position: 'absolute', left: size * 0.45 }} />
        </View>
      );

    case 'alert':
      // Triangle alert icon
      return (
        <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
          <View
            style={{
              width: size * 0.8,
              height: size * 0.8,
              borderWidth: stroke,
              borderColor: color,
              borderRadius: size * 0.15,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View style={{ width: stroke, height: size * 0.3, backgroundColor: color, marginBottom: 2 }} />
            <View style={{ width: stroke * 1.2, height: stroke * 1.2, borderRadius: stroke, backgroundColor: color }} />
          </View>
        </View>
      );

    case 'crown':
      // Crown / Payout beneficiary icon
      return (
        <View style={[{ width: size, height: size * 0.8, justifyContent: 'flex-end', alignItems: 'center' }, style]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' }}>
            <View style={{ width: stroke * 2, height: size * 0.45, backgroundColor: color, borderRadius: 1 }} />
            <View style={{ width: stroke * 2, height: size * 0.7, backgroundColor: color, marginHorizontal: 4, borderRadius: 1 }} />
            <View style={{ width: stroke * 2, height: size * 0.45, backgroundColor: color, borderRadius: 1 }} />
          </View>
          <View style={{ width: size * 0.8, height: stroke * 1.5, backgroundColor: color, borderRadius: 1, marginTop: 2 }} />
        </View>
      );

    case 'user':
      // User icon
      return (
        <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
          <View style={{ width: size * 0.36, height: size * 0.36, borderRadius: size * 0.18, backgroundColor: color }} />
          <View style={{ width: size * 0.7, height: size * 0.35, borderTopLeftRadius: size * 0.3, borderTopRightRadius: size * 0.3, backgroundColor: color, marginTop: 2 }} />
        </View>
      );

    case 'users':
      // Group of users icon
      return (
        <View style={[{ width: size, height: size, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, style]}>
          <View style={{ alignItems: 'center', opacity: 0.8 }}>
            <View style={{ width: size * 0.28, height: size * 0.28, borderRadius: size * 0.14, backgroundColor: color }} />
            <View style={{ width: size * 0.45, height: size * 0.25, borderTopLeftRadius: size * 0.2, borderTopRightRadius: size * 0.2, backgroundColor: color, marginTop: 1 }} />
          </View>
          <View style={{ alignItems: 'center', marginLeft: -4 }}>
            <View style={{ width: size * 0.34, height: size * 0.34, borderRadius: size * 0.17, backgroundColor: color }} />
            <View style={{ width: size * 0.55, height: size * 0.3, borderTopLeftRadius: size * 0.25, borderTopRightRadius: size * 0.25, backgroundColor: color, marginTop: 1 }} />
          </View>
        </View>
      );

    case 'phone':
      return (
        <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
          <View
            style={{
              width: size * 0.5,
              height: size * 0.8,
              borderRadius: size * 0.1,
              borderWidth: stroke,
              borderColor: color,
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 2,
            }}
          >
            <View style={{ width: size * 0.15, height: stroke * 0.7, backgroundColor: color, borderRadius: 1 }} />
            <View style={{ width: stroke * 1.5, height: stroke * 1.5, borderRadius: stroke, backgroundColor: color }} />
          </View>
        </View>
      );

    case 'calendar':
      return (
        <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
          <View
            style={{
              width: size * 0.8,
              height: size * 0.75,
              borderWidth: stroke,
              borderColor: color,
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <View style={{ height: size * 0.22, backgroundColor: color }} />
          </View>
        </View>
      );

    case 'cash':
      return (
        <View style={[{ width: size, height: size * 0.7, borderWidth: stroke, borderColor: color, borderRadius: 3, alignItems: 'center', justifyContent: 'center' }, style]}>
          <View style={{ width: size * 0.3, height: size * 0.3, borderRadius: size * 0.15, borderWidth: stroke, borderColor: color }} />
        </View>
      );

    case 'sync':
      return (
        <View
          style={[
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: stroke,
              borderColor: color,
              borderRightColor: 'transparent',
              borderLeftColor: 'transparent',
            },
            style,
          ]}
        />
      );

    case 'search':
      return (
        <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
          <View
            style={{
              width: size * 0.55,
              height: size * 0.55,
              borderRadius: size * 0.28,
              borderWidth: stroke,
              borderColor: color,
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: size * 0.12,
              right: size * 0.12,
              width: stroke,
              height: size * 0.35,
              backgroundColor: color,
              transform: [{ rotate: '-45deg' }],
            }}
          />
        </View>
      );

    case 'arrow-right':
      return (
        <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
          <View
            style={{
              width: size * 0.4,
              height: size * 0.4,
              borderTopWidth: stroke * 1.4,
              borderRightWidth: stroke * 1.4,
              borderColor: color,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </View>
      );

    case 'arrow-left':
      return (
        <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
          <View
            style={{
              width: size * 0.4,
              height: size * 0.4,
              borderBottomWidth: stroke * 1.4,
              borderLeftWidth: stroke * 1.4,
              borderColor: color,
              transform: [{ rotate: '45deg' }],
            }}
          />
        </View>
      );

    case 'close':
      return (
        <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
          <View style={{ width: size * 0.7, height: stroke * 1.4, backgroundColor: color, transform: [{ rotate: '45deg' }], position: 'absolute' }} />
          <View style={{ width: size * 0.7, height: stroke * 1.4, backgroundColor: color, transform: [{ rotate: '-45deg' }], position: 'absolute' }} />
        </View>
      );

    case 'plus':
      return (
        <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
          <View style={{ width: size * 0.7, height: stroke * 1.5, backgroundColor: color, position: 'absolute', borderRadius: 1 }} />
          <View style={{ height: size * 0.7, width: stroke * 1.5, backgroundColor: color, position: 'absolute', borderRadius: 1 }} />
        </View>
      );

    case 'filter':
      return (
        <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
          <View style={{ width: size * 0.8, height: stroke, backgroundColor: color, marginBottom: size * 0.12 }} />
          <View style={{ width: size * 0.5, height: stroke, backgroundColor: color, marginBottom: size * 0.12 }} />
          <View style={{ width: size * 0.25, height: stroke, backgroundColor: color }} />
        </View>
      );

    case 'target':
      return (
        <View
          style={[
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: stroke,
              borderColor: color,
              alignItems: 'center',
              justifyContent: 'center',
            },
            style,
          ]}
        >
          <View style={{ width: size * 0.35, height: size * 0.35, borderRadius: size * 0.18, backgroundColor: color }} />
        </View>
      );

    case 'shield':
      return (
        <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
          <View
            style={{
              width: size * 0.7,
              height: size * 0.8,
              borderWidth: stroke,
              borderColor: color,
              borderTopLeftRadius: 2,
              borderTopRightRadius: 2,
              borderBottomLeftRadius: size * 0.35,
              borderBottomRightRadius: size * 0.35,
            }}
          />
        </View>
      );

    default:
      return <View style={[{ width: size, height: size, backgroundColor: color }, style]} />;
  }
};
