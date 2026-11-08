// SYNTHETIC property data for the CBRE operations view. Invented numbers for a
// fictional portfolio. No real buildings, owners, tenants or rents.

export type SystemId = 'elevator' | 'structure' | 'power' | 'hvac' | 'fire' | 'water';

export interface SystemSpec {
  id: SystemId;
  label: string;
  repairHours: number; // downtime if it fails
  repairCost: number; // USD if it fails
}

export interface Property {
  buildingId: number;
  sqft: number;
  units: number; // leasable units (apartments, suites or bays)
  occupancy: number; // 0..1
  monthlyRevenue: number; // USD
  tenants: string; // short description
  lastInspection: string; // ISO date
  value: number; // USD, for exposure context only
  systems: SystemSpec[];
}

const sys = (id: SystemId, label: string, repairHours: number, repairCost: number): SystemSpec => ({ id, label, repairHours, repairCost });

export const PORTFOLIO: Property[] = [
  { buildingId: 1, sqft: 21600, units: 24, occupancy: 0.96, monthlyRevenue: 33600, tenants: '24 apartments, mostly long-term seniors', lastInspection: '2024-03-11', value: 4.1e6,
    systems: [sys('structure', 'Masonry and frame', 240, 310000), sys('elevator', 'Elevator (1968 hydraulic)', 96, 68000), sys('power', 'Electrical service', 36, 22000), sys('water', 'Water risers', 48, 18000)] },
  { buildingId: 2, sqft: 15200, units: 16, occupancy: 0.94, monthlyRevenue: 25600, tenants: '16 townhome units', lastInspection: '2025-01-20', value: 3.2e6,
    systems: [sys('structure', 'Wood frame', 160, 140000), sys('power', 'Electrical service', 30, 16000), sys('water', 'Water mains', 40, 14000)] },
  { buildingId: 3, sqft: 30400, units: 32, occupancy: 0.97, monthlyRevenue: 54400, tenants: '32 apartments', lastInspection: '2025-06-02', value: 7.4e6,
    systems: [sys('fire', 'Sprinklers and alarm panel', 72, 52000), sys('elevator', 'Elevators (2)', 72, 54000), sys('power', 'Electrical service', 30, 26000), sys('hvac', 'Central HVAC', 60, 38000)] },
  { buildingId: 4, sqft: 22800, units: 24, occupancy: 0.92, monthlyRevenue: 31200, tenants: '24 apartments, several families with children', lastInspection: '2023-11-08', value: 3.9e6,
    systems: [sys('structure', 'Concrete frame', 220, 260000), sys('elevator', 'Elevator', 84, 61000), sys('power', 'Electrical service', 36, 21000), sys('water', 'Water risers', 48, 17000)] },
  { buildingId: 5, sqft: 17600, units: 18, occupancy: 0.98, monthlyRevenue: 30600, tenants: '18 apartments', lastInspection: '2025-09-14', value: 5.1e6,
    systems: [sys('structure', 'Steel frame (2008 code)', 120, 90000), sys('power', 'Electrical service', 24, 15000), sys('hvac', 'Rooftop HVAC', 40, 24000)] },
  { buildingId: 6, sqft: 48000, units: 12, occupancy: 0.88, monthlyRevenue: 132000, tenants: '12 office suites, two clinics', lastInspection: '2025-04-22', value: 14.2e6,
    systems: [sys('power', 'Electrical service and backup generator', 18, 42000), sys('hvac', 'Chillers', 72, 96000), sys('elevator', 'Elevators (3)', 60, 88000), sys('fire', 'Fire suppression', 48, 40000)] },
  { buildingId: 7, sqft: 86000, units: 4, occupancy: 1, monthlyRevenue: 98000, tenants: '4 bays, cold storage for a grocery distributor', lastInspection: '2024-08-30', value: 11.8e6,
    systems: [sys('power', 'Electrical service (cold chain)', 12, 30000), sys('structure', 'Tilt-up walls and racking', 180, 210000), sys('fire', 'ESFR sprinklers', 48, 46000)] },
];
