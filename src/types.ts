export interface UserProfile {
  id: string;
  church: string;
  name: string;
  phone: string;
  vehicleModel: string;
  vehicleColor: string;
  plate: string;
  stateOfRegistration: string;
  occupants: string;
  email: string;
  logoUrl?: string;
}

export interface Attendance extends UserProfile {
  status: 'Arrived' | 'Departed';
  // Use the optional modifier (?) if older records might lack this field
  date?: string; 
  timestamp?: string; // Keep this if you still use it elsewhere
  arrivalTimestamp?: string;
  departureTimestamp?: string;
}