import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Spacing, Typography, Radius } from '../constants/theme';
import { supabase } from '../services/supabase';
import type { RootStackParamList } from '../navigation/types';

type SettingRowProps = {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  showToggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
  danger?: boolean;
};

function SettingRow({
  icon,
  label,
  value,
  onPress,
  showToggle,
  toggleValue,
  onToggle,
  danger,
}: SettingRowProps) {
  return (
    <TouchableOpacity
      style={styles.settingRow}
      onPress={onPress}
      activeOpacity={showToggle ? 1 : 0.6}
    >
      <View style={styles.settingLeft}>
        <Text style={styles.settingIcon}>{icon}</Text>
        <Text style={[styles.settingLabel, danger && { color: Colors.error }]}>
          {label}
        </Text>
      </View>
      {showToggle ? (
        <Switch
          value={toggleValue}
          onValueChange={onToggle}
          trackColor={{ false: Colors.border, true: Colors.primary }}
          thumbColor={Colors.white}
        />
      ) : (
        <View style={styles.settingRight}>
          {value && (
            <Text style={styles.settingValue}>{value}</Text>
          )}
          <Text style={styles.chevron}>›</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function SectionCard({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      {title && <Text style={styles.sectionTitle}>{title}</Text>}
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

export default function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(true);
  const [reminderSound, setReminderSound] = React.useState(true);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Profile</Text>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>VS</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>Vijay Sarathy</Text>
            <Text style={styles.profileEmail}>vijay@example.com</Text>
          </View>
          <TouchableOpacity style={styles.editProfileButton}>
            <Text style={styles.editProfileText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Stats Strip */}
        <View style={styles.statsStrip}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>28</Text>
            <Text style={styles.statLabel}>Day streak</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>94%</Text>
            <Text style={styles.statLabel}>Adherence</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>3</Text>
            <Text style={styles.statLabel}>Medicines</Text>
          </View>
        </View>

        <SectionCard title="Notifications">
          <SettingRow
            icon="🔔"
            label="Push Notifications"
            showToggle
            toggleValue={notificationsEnabled}
            onToggle={setNotificationsEnabled}
          />
          <View style={styles.divider} />
          <SettingRow
            icon="🔊"
            label="Reminder Sound"
            showToggle
            toggleValue={reminderSound}
            onToggle={setReminderSound}
          />
          <View style={styles.divider} />
          <SettingRow
            icon="⏰"
            label="Reminder Lead Time"
            value="15 min"
            onPress={() => {}}
          />
        </SectionCard>

        <SectionCard title="Health Data">
          <SettingRow icon="🩺" label="Medical History" onPress={() => {}} />
          <View style={styles.divider} />
          <SettingRow icon="📋" label="Prescriptions" onPress={() => {}} />
        </SectionCard>

        {/* ── Reports ── */}
        <SectionCard title="Reports">
          <TouchableOpacity
            style={styles.reportCard}
            onPress={() => navigation.navigate('Reports')}
            activeOpacity={0.75}
          >
            <View style={styles.reportCardLeft}>
              <View style={styles.reportCardIcon}>
                <Text style={{ fontSize: 24 }}>📊</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.reportCardTitle}>Weekly Adherence Report</Text>
                <Text style={styles.reportCardSub}>
                  PDF summary of your last 7 days — share with your doctor
                </Text>
              </View>
            </View>
            <Text style={styles.reportCardChevron}>›</Text>
          </TouchableOpacity>
        </SectionCard>

        <SectionCard title="Account">
          <SettingRow icon="🔒" label="Privacy & Security" onPress={() => {}} />
          <View style={styles.divider} />
          <SettingRow icon="📱" label="Connected Devices" onPress={() => {}} />
          <View style={styles.divider} />
          <SettingRow icon="❓" label="Help & Support" onPress={() => {}} />
          <View style={styles.divider} />
          <SettingRow
            icon="🚪"
            label="Sign Out"
            onPress={() => {
              supabase.auth.signOut();
            }}
            danger
          />
        </SectionCard>

        <Text style={styles.versionText}>MediMind v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  title: {
    fontSize: Typography.fontSizeXXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  profileCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  profileAvatarText: {
    color: Colors.white,
    fontSize: Typography.fontSizeLG,
    fontWeight: Typography.fontWeightBold,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: Typography.fontSizeLG,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.textPrimary,
  },
  profileEmail: {
    fontSize: Typography.fontSizeSM,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  editProfileButton: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  editProfileText: {
    color: Colors.primary,
    fontSize: Typography.fontSizeSM,
    fontWeight: Typography.fontWeightMedium,
  },
  statsStrip: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    marginBottom: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: Typography.fontSizeXL,
    fontWeight: Typography.fontWeightBold,
    color: Colors.primary,
  },
  statLabel: {
    fontSize: Typography.fontSizeXS,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.fontSizeSM,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    paddingLeft: Spacing.xs,
  },
  sectionCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  settingIcon: {
    fontSize: 18,
  },
  settingLabel: {
    fontSize: Typography.fontSizeMD,
    color: Colors.textPrimary,
    fontWeight: Typography.fontWeightRegular,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  settingValue: {
    fontSize: Typography.fontSizeSM,
    color: Colors.textSecondary,
  },
  chevron: {
    fontSize: 20,
    color: Colors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: Spacing.md + 26,
  },
  versionText: {
    textAlign: 'center',
    fontSize: Typography.fontSizeXS,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
  },
  reportCard: {
    flexDirection:   'row',
    alignItems:      'center',
    padding:         Spacing.md,
    gap:             Spacing.sm,
  },
  reportCardLeft: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing.sm,
    flex:          1,
  },
  reportCardIcon: {
    width:           48,
    height:          48,
    borderRadius:    Radius.md,
    backgroundColor: Colors.primaryLight,
    alignItems:      'center',
    justifyContent:  'center',
  },
  reportCardTitle: {
    fontSize:   Typography.fontSizeMD,
    fontWeight: Typography.fontWeightSemibold,
    color:      Colors.textPrimary,
  },
  reportCardSub: {
    fontSize:  Typography.fontSizeXS,
    color:     Colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  reportCardChevron: {
    fontSize: 22,
    color:    Colors.textMuted,
  },
});
