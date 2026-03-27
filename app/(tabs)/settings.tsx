import {
  getSelectedPlatforms,
  setSelectedPlatforms,
} from "@/lib/platformSettings";
import { requestSessionReset } from "@/lib/sessionReset";
import {
  clearAllOrders,
  clearOrdersOnly,
  getMonthlyBudget,
  getNotificationSettings,
  getStoredAccountIdentity,
  NotificationSettings,
  setMonthlyBudget,
} from "@/lib/storage";
import { Colors } from "@/src/theme/colors";
import { ALL_PLATFORMS, PLATFORM_CONFIGS, PlatformId } from "@/types/platform";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  cancelNotification,
  disableNotifications,
  enableNotifications,
  getNextReminderLabel,
  updateNotificationTime,
} from "@/lib/notifications";

const mono = Platform.select({ ios: "ui-monospace", default: "monospace" });

export default function SettingsScreen() {
  const [platforms, setPlatforms] = useState<PlatformId[]>([]);
  const [budget, setBudget] = useState<number | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [editingBudget, setEditingBudget] = useState(false);
  const [accounts, setAccounts] = useState<Record<PlatformId, string | null>>({
    blinkit: null,
    zepto: null,
  });
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>({
    enabled: false,
    hour: 21,
    minute: 0,
  });
  const [nextReminder, setNextReminder] = useState<string | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const loadSettings = useCallback(async () => {
    const [selected, storedBudget, ...identities] = await Promise.all([
      getSelectedPlatforms(),
      getMonthlyBudget(),
      ...ALL_PLATFORMS.map((p) => getStoredAccountIdentity(p)),
    ]);
    setPlatforms(selected.length > 0 ? selected : ALL_PLATFORMS);
    setBudget(storedBudget);
    setBudgetInput(storedBudget ? String(storedBudget) : "");
    const accs: Record<string, string | null> = {};
    ALL_PLATFORMS.forEach((p, i) => {
      accs[p] = identities[i];
    });
    setAccounts(accs as Record<PlatformId, string | null>);
    const notif = await getNotificationSettings();
    setNotifSettings(notif);
    const label = await getNextReminderLabel(notif);
    setNextReminder(label);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
      return undefined;
    }, [loadSettings]),
  );

  const togglePlatform = async (id: PlatformId) => {
    const next = platforms.includes(id)
      ? platforms.filter((p) => p !== id)
      : [...platforms, id];
    if (next.length === 0) return; // at least one required
    setPlatforms(next);
    await setSelectedPlatforms(next);
  };

  const handleSaveBudget = async () => {
    const parsed = parseInt(budgetInput.replace(/,/g, "").trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    await setMonthlyBudget(parsed);
    setBudget(parsed);
    setEditingBudget(false);
  };

  const handleRemoveBudget = async () => {
    await setMonthlyBudget(null);
    setBudget(null);
    setBudgetInput("");
    setEditingBudget(false);
  };

  const handleClearPlatform = (id: PlatformId) => {
    const name = PLATFORM_CONFIGS[id].displayName;
    Alert.alert(
      `Clear ${name} data?`,
      `This will erase all ${name} orders and log out the ${name} web session.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await clearOrdersOnly(id);
            await requestSessionReset(id);
            await loadSettings();
          },
        },
      ],
    );
  };

  const handleClearAll = () => {
    Alert.alert(
      "Clear all data?",
      "This will erase all orders from all platforms and reset all web sessions.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear all",
          style: "destructive",
          onPress: async () => {
            await clearAllOrders();
            for (const p of ALL_PLATFORMS) {
              await requestSessionReset(p);
            }
            await cancelNotification();
            setNotifSettings({ enabled: false, hour: 21, minute: 0 });
            setNextReminder(null);
            await loadSettings();
          },
        },
      ],
    );
  };

  const handleNotifToggle = async (value: boolean) => {
    if (value) {
      const granted = await enableNotifications(
        notifSettings.hour,
        notifSettings.minute,
      );
      if (!granted) return;
      const updated = { ...notifSettings, enabled: true };
      setNotifSettings(updated);
      setNextReminder(await getNextReminderLabel(updated));
    } else {
      await disableNotifications();
      setNotifSettings({ ...notifSettings, enabled: false });
      setNextReminder(null);
    }
  };

  const handleTimeChange = async (_event: any, selectedDate?: Date) => {
    setShowTimePicker(false);
    if (!selectedDate) return;
    const hour = selectedDate.getHours();
    const minute = selectedDate.getMinutes();
    await updateNotificationTime(hour, minute);
    const updated = { ...notifSettings, hour, minute };
    setNotifSettings(updated);
    setNextReminder(await getNextReminderLabel(updated));
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.headerLabel}>SETTINGS</Text>
      <Text style={styles.headerTitle}>Preferences</Text>

      {/* Platforms section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>PLATFORMS</Text>
        <Text style={styles.sectionDesc}>
          Select which quick commerce platforms to sync.
        </Text>
        <View style={styles.optionList}>
          {ALL_PLATFORMS.map((id) => {
            const config = PLATFORM_CONFIGS[id];
            const isSelected = platforms.includes(id);
            return (
              <Pressable
                key={id}
                style={[styles.option, isSelected && styles.optionSelected]}
                onPress={() => togglePlatform(id)}
              >
                <View
                  style={[
                    styles.iconCircle,
                    { backgroundColor: config.color + "22" },
                  ]}
                >
                  <Ionicons
                    name={config.icon as any}
                    size={20}
                    color={config.color}
                  />
                </View>
                <Text style={styles.optionLabel}>{config.displayName}</Text>
                <View
                  style={[
                    styles.checkbox,
                    isSelected && styles.checkboxSelected,
                  ]}
                >
                  {isSelected && (
                    <Ionicons name="checkmark" size={14} color={Colors.white} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Budget section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>MONTHLY BUDGET</Text>
        {editingBudget ? (
          <View style={styles.budgetEditRow}>
            <TextInput
              value={budgetInput}
              onChangeText={(t) => setBudgetInput(t.replace(/[^\d]/g, ""))}
              placeholder="15000"
              placeholderTextColor={Colors.textPlaceholder}
              keyboardType="number-pad"
              autoFocus
              style={styles.budgetInput}
            />
            <View style={styles.budgetActions}>
              <Pressable style={styles.budgetSave} onPress={handleSaveBudget}>
                <Text style={styles.budgetSaveText}>Save</Text>
              </Pressable>
              <Pressable
                style={styles.budgetCancel}
                onPress={() => setEditingBudget(false)}
              >
                <Text style={styles.budgetCancelText}>Cancel</Text>
              </Pressable>
            </View>
            {budget !== null && (
              <Pressable onPress={handleRemoveBudget}>
                <Text style={styles.budgetRemoveText}>Remove budget</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <Pressable
            style={styles.budgetDisplay}
            onPress={() => {
              setBudgetInput(budget ? String(budget) : "");
              setEditingBudget(true);
            }}
          >
            <Text style={styles.budgetValue}>
              {budget !== null
                ? `₹${budget.toLocaleString("en-IN")}`
                : "Not set"}
            </Text>
            <Text style={styles.budgetEditLink}>
              {budget !== null ? "Edit" : "Set budget"}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Accounts section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ACCOUNTS</Text>
        {ALL_PLATFORMS.map((id) => {
          const config = PLATFORM_CONFIGS[id];
          const identity = accounts[id];
          return (
            <View key={id} style={styles.accountRow}>
              <View
                style={[styles.accountDot, { backgroundColor: config.color }]}
              />
              <Text style={styles.accountPlatform}>{config.displayName}</Text>
              <Text style={styles.accountIdentity}>
                {identity
                  ? `+91 ${identity.slice(0, 5)} ${identity.slice(5)}`
                  : "Not synced"}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Notifications section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>NOTIFICATIONS</Text>
        <View style={styles.notifRow}>
          <Text style={styles.notifLabel}>Enable Reminders</Text>
          <Switch
            value={notifSettings.enabled}
            onValueChange={handleNotifToggle}
            trackColor={{ false: Colors.bgOverlay, true: Colors.greenDark }}
            thumbColor={notifSettings.enabled ? Colors.green : Colors.textMuted}
          />
        </View>
        <Pressable
          style={[
            styles.notifRow,
            !notifSettings.enabled && styles.notifRowDisabled,
          ]}
          onPress={() => notifSettings.enabled && setShowTimePicker(true)}
          disabled={!notifSettings.enabled}
        >
          <Text
            style={[
              styles.notifLabel,
              !notifSettings.enabled && styles.notifTextDisabled,
            ]}
          >
            Reminder Time
          </Text>
          <Text
            style={[
              styles.notifValue,
              !notifSettings.enabled && styles.notifTextDisabled,
            ]}
          >
            {new Date(
              0,
              0,
              0,
              notifSettings.hour,
              notifSettings.minute,
            ).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </Text>
        </Pressable>
        {nextReminder && (
          <View style={styles.notifRow}>
            <Text style={styles.notifLabel}>Next Reminder</Text>
            <Text style={styles.notifHint}>{nextReminder}</Text>
          </View>
        )}
        {showTimePicker && (
          <DateTimePicker
            value={new Date(0, 0, 0, notifSettings.hour, notifSettings.minute)}
            mode="time"
            is24Hour={false}
            display="spinner"
            onChange={handleTimeChange}
            themeVariant="dark"
          />
        )}
      </View>

      {/* Data section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>DATA</Text>
        {ALL_PLATFORMS.map((id) => (
          <Pressable
            key={id}
            style={styles.clearButton}
            onPress={() => handleClearPlatform(id)}
          >
            <Text style={styles.clearButtonText}>
              Clear {PLATFORM_CONFIGS[id].displayName} data
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.clearButton, styles.clearAllButton]}
          onPress={handleClearAll}
        >
          <Text style={[styles.clearButtonText, styles.clearAllText]}>
            Clear all data
          </Text>
        </Pressable>
      </View>

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ABOUT</Text>
        <Text style={styles.aboutText}>QC Spend Tracker v1.0</Text>
        <Text style={styles.aboutSubtext}>
          Your quick commerce spending, analyzed.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: Colors.bgBase,
  },
  content: {
    padding: 20,
    paddingTop: 60,
    paddingBottom: 48,
    gap: 24,
  },
  headerLabel: {
    fontSize: 11,
    color: Colors.textDisabled,
    letterSpacing: 1.4,
    fontFamily: mono,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: "600",
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  section: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 10,
    color: Colors.textDisabled,
    fontFamily: mono,
    letterSpacing: 1.2,
  },
  sectionDesc: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 19,
    marginTop: -4,
  },
  optionList: {
    gap: 10,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: Colors.bgOverlay,
  },
  optionSelected: {
    borderColor: Colors.green,
    backgroundColor: Colors.greenBg,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  optionLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    borderColor: Colors.green,
    backgroundColor: Colors.green,
  },
  budgetDisplay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  budgetValue: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.textHeading,
    letterSpacing: -0.4,
  },
  budgetEditLink: {
    fontSize: 13,
    color: Colors.green,
    fontWeight: "600",
  },
  budgetEditRow: {
    gap: 10,
  },
  budgetInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgBase,
    color: Colors.textPrimary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  budgetActions: {
    flexDirection: "row",
    gap: 10,
  },
  budgetSave: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.green,
    alignItems: "center",
  },
  budgetSaveText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.white,
  },
  budgetCancel: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.bgOverlay,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  budgetCancelText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  budgetRemoveText: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  accountDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  accountPlatform: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textPrimary,
    width: 70,
  },
  accountIdentity: {
    flex: 1,
    fontSize: 13,
    color: Colors.textMuted,
    fontFamily: mono,
  },
  clearButton: {
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.bgOverlay,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    alignItems: "center",
  },
  clearButtonText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: "500",
  },
  clearAllButton: {
    borderColor: Colors.red,
    backgroundColor: Colors.redBg,
  },
  clearAllText: {
    color: Colors.red,
  },
  notifRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  notifRowDisabled: {
    opacity: 0.4,
  },
  notifLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  notifValue: {
    fontSize: 14,
    color: Colors.green,
    fontWeight: "600",
  },
  notifTextDisabled: {
    color: Colors.textDisabled,
  },
  notifHint: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  aboutText: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  aboutSubtext: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: -6,
  },
});
