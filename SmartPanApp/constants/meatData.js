// Meat types with icons and available doneness levels
export const MEAT_TYPES = [
  {
    id: 'steak',
    label: 'Steak',
    icon: '🥩',
    donenessOptions: ['rare', 'medium_rare', 'medium', 'medium_well', 'well_done'],
    restMinutes: 5,
  },
  {
    id: 'chicken',
    label: 'Chicken',
    icon: '🍗',
    donenessOptions: ['well_done'],
    restMinutes: 3,
  },
  {
    id: 'pork',
    label: 'Pork Chop',
    icon: '🐷',
    donenessOptions: ['medium', 'well_done'],
    restMinutes: 3,
  },
  {
    id: 'fish',
    label: 'Fish',
    icon: '🐟',
    donenessOptions: ['medium', 'well_done'],
    restMinutes: 2,
  },
  {
    id: 'lamb',
    label: 'Lamb',
    icon: '🐑',
    donenessOptions: ['rare', 'medium_rare', 'medium', 'well_done'],
    restMinutes: 5,
  },
  {
    id: 'turkey',
    label: 'Turkey',
    icon: '🦃',
    donenessOptions: ['well_done'],
    restMinutes: 5,
  },
];

// Doneness definitions with target internal temp (°C) and display info.
// `flipTempC` is the probe temperature at which side 1 should end. Calibrated
// for a 1" steak — medium_rare lands at 33 °C per the heat-equation flip rule;
// other doneness levels step up evenly.
export const DONENESS = {
  rare: {
    id: 'rare',
    label: 'Rare',
    tempC: 52,
    flipTempC: 30,
    color: '#C0392B',
    description: 'Cool red center',
  },
  medium_rare: {
    id: 'medium_rare',
    label: 'Medium Rare',
    tempC: 57,
    flipTempC: 33,
    color: '#E74C3C',
    description: 'Warm red center',
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    tempC: 63,
    flipTempC: 36,
    color: '#E67E22',
    description: 'Pink center',
  },
  medium_well: {
    id: 'medium_well',
    label: 'Medium Well',
    tempC: 66,
    flipTempC: 39,
    color: '#F39C12',
    description: 'Slightly pink center',
  },
  well_done: {
    id: 'well_done',
    label: 'Well Done',
    tempC: 71,
    flipTempC: 42,
    color: '#7F8C8D',
    description: 'No pink, fully cooked',
  },
};

// Cook time in minutes per side, per inch of thickness
// Assumes pan at ~190°C (calibration baseline)
export const COOK_TIME_PER_INCH = {
  steak: {
    rare: 2.0,
    medium_rare: 2.5,
    medium: 3.0,
    medium_well: 3.5,
    well_done: 4.5,
  },
  chicken: {
    well_done: 5.5,
  },
  pork: {
    medium: 3.5,
    well_done: 4.5,
  },
  fish: {
    medium: 2.5,
    well_done: 3.0,
  },
  lamb: {
    rare: 2.0,
    medium_rare: 2.5,
    medium: 3.0,
    well_done: 4.5,
  },
  turkey: {
    well_done: 6.0,
  },
};
