import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, StyleSheet } from 'react-native';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PrivacyPolicyModal({ isOpen, onClose }: PrivacyPolicyModalProps) {
  return (
    <Modal visible={isOpen} transparent={true} animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Privacy Policy</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.content}>
            <Text style={styles.lastUpdated}>Last Updated: July 2026</Text>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>1. Information We Collect</Text>
              <Text style={styles.text}>
                We collect information to provide, maintain, and secure our vehicle security services. This includes:
              </Text>
              <Text style={styles.listItem}>• Personal Information: Name, email address, phone number, and church details provided during registration.</Text>
              <Text style={styles.listItem}>• Vehicle Information: Vehicle make, model, color, license plate number, state of registration, and authorized occupants.</Text>
              <Text style={styles.listItem}>• Usage and Device Data: IP address, device type, operating system version, app interaction metrics, and crash logs.</Text>
              <Text style={styles.listItem}>• Access Logs: Timestamped records of vehicle arrivals, departures, and QR code scans.</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>2. How We Use Your Information</Text>
              <Text style={styles.text}>
                We use the information we collect for various security and operational purposes, including to:
              </Text>
              <Text style={styles.listItem}>• Provide and Maintain the Service: Operate core app features, including real-time vehicle monitoring, security alerts, and tracking systems.</Text>
              <Text style={styles.listItem}>• Enhance Security: Authenticate user identity, detect unauthorized access attempts, prevent fraud, and issue safety notifications.</Text>
              <Text style={styles.listItem}>• Communicate with You: Send technical notices, updates, security alerts, support messages, and administrative announcements.</Text>
              <Text style={styles.listItem}>• Improve the App: Analyze usage trends, monitor feature performance, and optimize user experience.</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>3. How We Share Your Information</Text>
              <Text style={styles.text}>
                We respect your privacy and do not sell your personal data. We may share information only in limited circumstances:
              </Text>
              <Text style={styles.listItem}>• Service Providers: With trusted third-party vendors who assist us in operating the App.</Text>
              <Text style={styles.listItem}>• Legal Obligations & Safety: If required by law or in response to valid requests by public authorities.</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>4. Data Security and Protection</Text>
              <Text style={styles.text}>
                We implement robust administrative, technical, and physical security measures designed to protect your personal data and vehicle telemetry from unauthorized access, loss, or alteration. All data transmitted is encrypted in transit.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>5. Data Retention</Text>
              <Text style={styles.text}>
                We retain your personal information only for as long as is necessary for the purposes set out in this Privacy Policy.
              </Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>6. Your Rights and Choices</Text>
              <Text style={styles.listItem}>• Access and Correction: Request access to or correction of your account.</Text>
              <Text style={styles.listItem}>• Data Deletion: Request the deletion of your account and associated personal data.</Text>
              <Text style={styles.listItem}>• Permission Controls: Withdraw consent for data collection through device settings.</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>7. Changes to This Privacy Policy</Text>
              <Text style={styles.text}>
                We may update this Privacy Policy from time to time to reflect changes in our practices.
              </Text>
            </View>
            
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>8. Contact Us</Text>
              <Text style={styles.text}>
                If you have questions, please contact us at:
              </Text>
              <Text style={styles.text}>Email: deuxm.ventures@gmail.com</Text>
              <Text style={styles.text}>Website: https://tishmor.com</Text>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxHeight: '90%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 18,
    color: '#666',
  },
  content: {
    padding: 16,
  },
  lastUpdated: {
    color: '#666',
    marginBottom: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  text: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
    marginBottom: 8,
  },
  listItem: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
    marginLeft: 8,
    marginBottom: 4,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    alignItems: 'flex-end',
    backgroundColor: '#f9f9f9',
  },
  closeBtn: {
    backgroundColor: '#0d9488',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  closeBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  }
});
