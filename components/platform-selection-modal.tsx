import { Colors } from '@/src/theme/colors';
import { PlatformId, ALL_PLATFORMS, PLATFORM_CONFIGS } from '@/types/platform';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

interface Props {
  visible: boolean;
  initialSelection?: PlatformId[];
  onConfirm: (platforms: PlatformId[]) => void;
  onCancel?: () => void;
  showCancelButton?: boolean;
  title?: string;
  subtitle?: string;
}

export default function PlatformSelectionModal({
  visible,
  initialSelection = [],
  onConfirm,
  onCancel,
  showCancelButton = false,
  title = 'Select Platforms',
  subtitle = 'Choose which quick commerce platforms you want to sync. You can change this later in Settings.',
}: Props) {
  const [selected, setSelected] = useState<Set<PlatformId>>(new Set(initialSelection));

  const toggle = (id: PlatformId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id); // at least one must remain
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <View style={styles.optionList}>
            {ALL_PLATFORMS.map((id) => {
              const config = PLATFORM_CONFIGS[id];
              const isSelected = selected.has(id);
              return (
                <Pressable
                  key={id}
                  style={[styles.option, isSelected && styles.optionSelected]}
                  onPress={() => toggle(id)}
                >
                  <View style={[styles.iconCircle, { backgroundColor: config.color + '22' }]}>
                    <Ionicons
                      name={config.icon as any}
                      size={22}
                      color={config.color}
                    />
                  </View>
                  <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                    {config.displayName}
                  </Text>
                  <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                    {isSelected && <Ionicons name="checkmark" size={16} color={Colors.white} />}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={[styles.confirmButton, selected.size === 0 && styles.confirmButtonDisabled]}
            onPress={() => selected.size > 0 && onConfirm(Array.from(selected))}
            disabled={selected.size === 0}
          >
            <Text style={styles.confirmButtonText}>Continue</Text>
          </Pressable>

          {showCancelButton && onCancel && (
            <Pressable style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 24,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  title: {
    color: Colors.textHeading,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 24,
  },
  optionList: {
    gap: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.bgOverlay,
  },
  optionSelected: {
    borderColor: Colors.green,
    backgroundColor: Colors.greenBg,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  optionLabel: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  optionLabelSelected: {
    color: Colors.textHeading,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    borderColor: Colors.green,
    backgroundColor: Colors.green,
  },
  confirmButton: {
    marginTop: 24,
    borderRadius: 18,
    backgroundColor: Colors.greenDark,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  confirmButtonDisabled: {
    opacity: 0.4,
  },
  confirmButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  cancelButton: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
});
