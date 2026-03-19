/**
 * Capital city / representative location coordinates for ISO 3166 codes.
 * Used by the weather feature on country pages.
 *
 * Format: [latitude, longitude]
 */

/** Capital city coordinates for ISO 3166-1 alpha-2 country codes. */
const COUNTRY_COORDS: Record<string, [number, number]> = {
  AF: [34.53, 69.17],    // Kabul
  AL: [41.33, 19.82],    // Tirana
  DZ: [36.75, 3.04],     // Algiers
  AD: [42.51, 1.52],     // Andorra la Vella
  AO: [-8.84, 13.23],    // Luanda
  AG: [17.12, -61.85],   // St. John's
  AR: [-34.60, -58.38],  // Buenos Aires
  AM: [40.18, 44.51],    // Yerevan
  AU: [-35.28, 149.13],  // Canberra
  AT: [48.21, 16.37],    // Vienna
  AZ: [40.41, 49.87],    // Baku
  BS: [25.06, -77.35],   // Nassau
  BH: [26.23, 50.58],    // Manama
  BD: [23.81, 90.41],    // Dhaka
  BB: [13.10, -59.61],   // Bridgetown
  BY: [53.90, 27.57],    // Minsk
  BE: [50.85, 4.35],     // Brussels
  BZ: [17.25, -88.77],   // Belmopan
  BJ: [6.50, 2.60],      // Porto-Novo
  BT: [27.47, 89.64],    // Thimphu
  BO: [-16.50, -68.15],  // La Paz
  BA: [43.86, 18.41],    // Sarajevo
  BW: [-24.65, 25.91],   // Gaborone
  BR: [-15.79, -47.88],  // Brasília
  BN: [4.94, 114.95],    // Bandar Seri Begawan
  BG: [42.70, 23.32],    // Sofia
  BF: [12.37, -1.52],    // Ouagadougou
  BI: [-3.38, 29.36],    // Gitega
  CV: [14.93, -23.51],   // Praia
  KH: [11.56, 104.92],   // Phnom Penh
  CM: [3.87, 11.52],     // Yaoundé
  CA: [45.42, -75.70],   // Ottawa
  CF: [4.36, 18.56],     // Bangui
  TD: [12.13, 15.05],    // N'Djamena
  CL: [-33.45, -70.67],  // Santiago
  CN: [39.90, 116.40],   // Beijing
  CO: [4.71, -74.07],    // Bogotá
  KM: [-11.70, 43.26],   // Moroni
  CG: [-4.27, 15.28],    // Brazzaville
  CD: [-4.32, 15.31],    // Kinshasa
  CR: [9.93, -84.08],    // San José
  CI: [6.85, -5.30],     // Yamoussoukro
  HR: [45.81, 15.98],    // Zagreb
  CU: [23.11, -82.37],   // Havana
  CY: [35.17, 33.37],    // Nicosia
  CZ: [50.08, 14.44],    // Prague
  DK: [55.68, 12.57],    // Copenhagen
  DJ: [11.59, 43.15],    // Djibouti
  DM: [15.30, -61.39],   // Roseau
  DO: [18.49, -69.90],   // Santo Domingo
  EC: [-0.18, -78.47],   // Quito
  EG: [30.04, 31.24],    // Cairo
  SV: [13.69, -89.19],   // San Salvador
  GQ: [3.75, 8.78],      // Malabo
  ER: [15.34, 38.93],    // Asmara
  EE: [59.44, 24.75],    // Tallinn
  SZ: [-26.32, 31.13],   // Mbabane
  ET: [9.02, 38.75],     // Addis Ababa
  FJ: [-18.14, 178.44],  // Suva
  FI: [60.17, 24.94],    // Helsinki
  FR: [48.86, 2.35],     // Paris
  GA: [0.39, 9.45],      // Libreville
  GM: [13.45, -16.58],   // Banjul
  GE: [41.72, 44.79],    // Tbilisi
  DE: [52.52, 13.41],    // Berlin
  GH: [5.56, -0.19],     // Accra
  GR: [37.98, 23.73],    // Athens
  GD: [12.05, -61.75],   // St. George's
  GT: [14.63, -90.51],   // Guatemala City
  GN: [9.64, -13.58],    // Conakry
  GW: [11.86, -15.60],   // Bissau
  GY: [6.80, -58.16],    // Georgetown
  HT: [18.54, -72.34],   // Port-au-Prince
  HN: [14.07, -87.19],   // Tegucigalpa
  HU: [47.50, 19.04],    // Budapest
  IS: [64.15, -21.94],   // Reykjavik
  IN: [28.61, 77.21],    // New Delhi
  ID: [-6.21, 106.85],   // Jakarta
  IR: [35.69, 51.42],    // Tehran
  IQ: [33.31, 44.37],    // Baghdad
  IE: [53.35, -6.26],    // Dublin
  IL: [31.77, 35.23],    // Jerusalem
  IT: [41.90, 12.50],    // Rome
  JM: [18.00, -76.79],   // Kingston
  JP: [35.68, 139.69],   // Tokyo
  JO: [31.95, 35.93],    // Amman
  KZ: [51.17, 71.43],    // Astana
  KE: [-1.29, 36.82],    // Nairobi
  KI: [1.33, 172.98],    // Tarawa
  KP: [39.02, 125.75],   // Pyongyang
  KR: [37.57, 126.98],   // Seoul
  KW: [29.38, 47.99],    // Kuwait City
  KG: [42.87, 74.59],    // Bishkek
  LA: [17.97, 102.63],   // Vientiane
  LV: [56.95, 24.11],    // Riga
  LB: [33.89, 35.50],    // Beirut
  LS: [-29.31, 27.48],   // Maseru
  LR: [6.30, -10.80],    // Monrovia
  LY: [32.90, 13.18],    // Tripoli
  LI: [47.14, 9.52],     // Vaduz
  LT: [54.69, 25.28],    // Vilnius
  LU: [49.61, 6.13],     // Luxembourg City
  MG: [-18.91, 47.52],   // Antananarivo
  MW: [-13.97, 33.79],   // Lilongwe
  MY: [3.14, 101.69],    // Kuala Lumpur
  MV: [4.18, 73.51],     // Malé
  ML: [12.64, -8.00],    // Bamako
  MT: [35.90, 14.51],    // Valletta
  MH: [7.09, 171.38],    // Majuro
  MR: [18.09, -15.98],   // Nouakchott
  MU: [-20.16, 57.50],   // Port Louis
  MX: [19.43, -99.13],   // Mexico City
  FM: [6.92, 158.16],    // Palikir
  MD: [47.01, 28.86],    // Chișinău
  MC: [43.73, 7.42],     // Monaco
  MN: [47.91, 106.91],   // Ulaanbaatar
  ME: [42.44, 19.26],    // Podgorica
  MA: [33.97, -6.85],    // Rabat
  MZ: [-25.97, 32.57],   // Maputo
  MM: [19.76, 96.07],    // Naypyidaw
  NA: [-22.56, 17.08],   // Windhoek
  NR: [-0.55, 166.92],   // Yaren
  NP: [27.72, 85.32],    // Kathmandu
  NL: [52.37, 4.89],     // Amsterdam
  NZ: [-41.29, 174.78],  // Wellington
  NI: [12.15, -86.27],   // Managua
  NE: [13.51, 2.11],     // Niamey
  NG: [9.06, 7.49],      // Abuja
  MK: [42.00, 21.43],    // Skopje
  NO: [59.91, 10.75],    // Oslo
  OM: [23.61, 58.59],    // Muscat
  PK: [33.69, 73.04],    // Islamabad
  PW: [7.50, 134.62],    // Ngerulmud
  PA: [8.98, -79.52],    // Panama City
  PG: [-6.31, 147.18],   // Port Moresby
  PY: [-25.26, -57.58],  // Asunción
  PE: [-12.05, -77.04],  // Lima
  PH: [14.60, 120.98],   // Manila
  PL: [52.23, 21.01],    // Warsaw
  PT: [38.72, -9.14],    // Lisbon
  QA: [25.29, 51.53],    // Doha
  RO: [44.43, 26.10],    // Bucharest
  RU: [55.76, 37.62],    // Moscow
  RW: [-1.94, 29.87],    // Kigali
  KN: [17.30, -62.72],   // Basseterre
  LC: [14.01, -60.99],   // Castries
  VC: [13.16, -61.23],   // Kingstown
  WS: [-13.83, -171.76], // Apia
  SM: [43.94, 12.45],    // San Marino
  ST: [0.34, 6.73],      // São Tomé
  SA: [24.69, 46.72],    // Riyadh
  SN: [14.69, -17.44],   // Dakar
  RS: [44.79, 20.47],    // Belgrade
  SC: [-4.62, 55.45],    // Victoria
  SL: [8.48, -13.23],    // Freetown
  SG: [1.35, 103.82],    // Singapore
  SK: [48.15, 17.11],    // Bratislava
  SI: [46.06, 14.51],    // Ljubljana
  SB: [-9.43, 160.03],   // Honiara
  SO: [2.05, 45.32],     // Mogadishu
  ZA: [-25.75, 28.19],   // Pretoria
  SS: [4.85, 31.61],     // Juba
  ES: [40.42, -3.70],    // Madrid
  LK: [6.93, 79.84],     // Colombo
  SD: [15.59, 32.53],    // Khartoum
  SR: [5.87, -55.17],    // Paramaribo
  SE: [59.33, 18.07],    // Stockholm
  CH: [46.95, 7.45],     // Bern
  SY: [33.51, 36.29],    // Damascus
  TW: [25.03, 121.57],   // Taipei
  TJ: [38.56, 68.77],    // Dushanbe
  TZ: [-6.16, 35.74],    // Dodoma
  TH: [13.76, 100.50],   // Bangkok
  TL: [-8.56, 125.57],   // Dili
  TG: [6.14, 1.21],      // Lomé
  TO: [-21.21, -175.20], // Nukuʻalofa
  TT: [10.66, -61.51],   // Port of Spain
  TN: [36.81, 10.18],    // Tunis
  TR: [39.93, 32.85],    // Ankara
  TM: [37.95, 58.38],    // Ashgabat
  TV: [-8.52, 179.20],   // Funafuti
  UG: [0.35, 32.58],     // Kampala
  UA: [50.45, 30.52],    // Kyiv
  AE: [24.45, 54.65],    // Abu Dhabi
  GB: [51.51, -0.13],    // London
  US: [38.90, -77.04],   // Washington, D.C.
  UY: [-34.88, -56.17],  // Montevideo
  UZ: [41.30, 69.28],    // Tashkent
  VU: [-17.73, 168.32],  // Port Vila
  VA: [41.90, 12.45],    // Vatican City
  VE: [10.49, -66.88],   // Caracas
  VN: [21.03, 105.85],   // Hanoi
  YE: [15.35, 44.21],    // Sana'a
  ZM: [-15.39, 28.32],   // Lusaka
  ZW: [-17.83, 31.05],   // Harare
};

/**
 * Representative coordinates for ISO 3166-2 subdivisions.
 * Uses capital / largest city. Falls back to country capital if not listed.
 */
const SUBDIVISION_COORDS: Record<string, [number, number]> = {
  // US states
  'US-AL': [32.38, -86.30], 'US-AK': [64.84, -147.72], 'US-AZ': [33.45, -112.07],
  'US-AR': [34.75, -92.29], 'US-CA': [34.05, -118.24], 'US-CO': [39.74, -104.98],
  'US-CT': [41.76, -72.68], 'US-DE': [39.16, -75.52], 'US-FL': [25.76, -80.19],
  'US-GA': [33.75, -84.39], 'US-HI': [21.31, -157.86], 'US-ID': [43.62, -116.20],
  'US-IL': [41.88, -87.63], 'US-IN': [39.77, -86.16], 'US-IA': [41.59, -93.60],
  'US-KS': [39.05, -95.68], 'US-KY': [38.25, -85.76], 'US-LA': [29.95, -90.07],
  'US-ME': [43.66, -70.26], 'US-MD': [39.29, -76.61], 'US-MA': [42.36, -71.06],
  'US-MI': [42.33, -83.05], 'US-MN': [44.98, -93.27], 'US-MS': [32.30, -90.18],
  'US-MO': [38.63, -90.20], 'US-MT': [46.87, -114.00], 'US-NE': [41.26, -95.94],
  'US-NV': [36.17, -115.14], 'US-NH': [43.21, -71.54], 'US-NJ': [40.74, -74.18],
  'US-NM': [35.08, -106.65], 'US-NY': [40.71, -74.01], 'US-NC': [35.78, -78.64],
  'US-ND': [46.88, -96.79], 'US-OH': [39.96, -82.99], 'US-OK': [35.47, -97.52],
  'US-OR': [45.52, -122.68], 'US-PA': [39.95, -75.17], 'US-RI': [41.82, -71.41],
  'US-SC': [34.00, -81.03], 'US-SD': [43.55, -96.73], 'US-TN': [36.16, -86.78],
  'US-TX': [30.27, -97.74], 'US-UT': [40.76, -111.89], 'US-VT': [44.26, -72.58],
  'US-VA': [37.54, -77.43], 'US-WA': [47.61, -122.33], 'US-WV': [38.35, -81.63],
  'US-WI': [43.07, -89.40], 'US-WY': [41.14, -104.82], 'US-DC': [38.90, -77.04],
  'US-PR': [18.47, -66.11], 'US-GU': [13.44, 144.79],

  // Canadian provinces
  'CA-AB': [51.05, -114.07], 'CA-BC': [49.28, -123.12], 'CA-MB': [49.90, -97.14],
  'CA-NB': [45.96, -66.65], 'CA-NL': [47.56, -52.71], 'CA-NS': [44.65, -63.57],
  'CA-NT': [62.45, -114.37], 'CA-NU': [63.75, -68.52], 'CA-ON': [43.65, -79.38],
  'CA-PE': [46.24, -63.13], 'CA-QC': [45.50, -73.57], 'CA-SK': [50.45, -104.62],
  'CA-YT': [60.72, -135.06],

  // Australian states
  'AU-ACT': [-35.28, 149.13], 'AU-NSW': [-33.87, 151.21], 'AU-NT': [-12.46, 130.84],
  'AU-QLD': [-27.47, 153.03], 'AU-SA': [-34.93, 138.60], 'AU-TAS': [-42.88, 147.33],
  'AU-VIC': [-37.81, 144.96], 'AU-WA': [-31.95, 115.86],

  // UK
  'GB-ENG': [51.51, -0.13], 'GB-SCT': [55.95, -3.19], 'GB-WLS': [51.48, -3.18],
  'GB-NIR': [54.60, -5.93],

  // German states
  'DE-BW': [48.78, 9.18], 'DE-BY': [48.14, 11.58], 'DE-BE': [52.52, 13.41],
  'DE-BB': [52.39, 13.07], 'DE-HB': [53.08, 8.80], 'DE-HH': [53.55, 9.99],
  'DE-HE': [50.11, 8.68], 'DE-MV': [53.63, 11.42], 'DE-NI': [52.37, 9.74],
  'DE-NW': [51.23, 6.78], 'DE-RP': [50.00, 8.27], 'DE-SL': [49.23, 7.00],
  'DE-SN': [51.05, 13.74], 'DE-ST': [51.48, 11.97], 'DE-SH': [54.32, 10.14],
  'DE-TH': [50.98, 11.03],

  // French regions
  'FR-ARA': [45.76, 4.84], 'FR-BFC': [47.32, 5.04], 'FR-BRE': [48.11, -1.68],
  'FR-CVL': [47.39, 0.69], 'FR-COR': [42.15, 9.10], 'FR-GES': [48.57, 7.75],
  'FR-HDF': [50.63, 3.06], 'FR-IDF': [48.86, 2.35], 'FR-NAQ': [44.84, -0.58],
  'FR-NOR': [49.44, 1.10], 'FR-OCC': [43.60, 1.44], 'FR-PDL': [47.22, -1.55],
  'FR-PAC': [43.30, 5.37],

  // Brazilian states (major cities)
  'BR-SP': [-23.55, -46.63], 'BR-RJ': [-22.91, -43.17], 'BR-MG': [-19.92, -43.94],
  'BR-BA': [-12.97, -38.51], 'BR-DF': [-15.79, -47.88], 'BR-RS': [-30.03, -51.23],
  'BR-PR': [-25.43, -49.27], 'BR-PE': [-8.05, -34.87], 'BR-CE': [-3.72, -38.53],
  'BR-PA': [-1.46, -48.50], 'BR-AM': [-3.12, -60.02], 'BR-GO': [-16.68, -49.26],

  // Indian states (major cities)
  'IN-DL': [28.61, 77.21], 'IN-MH': [19.08, 72.88], 'IN-KA': [12.97, 77.59],
  'IN-TN': [13.08, 80.27], 'IN-WB': [22.57, 88.36], 'IN-GJ': [23.02, 72.57],
  'IN-RJ': [26.91, 75.79], 'IN-UP': [26.85, 80.95], 'IN-KL': [8.52, 76.94],
  'IN-AP': [17.39, 78.49], 'IN-TG': [17.39, 78.49], 'IN-PB': [30.73, 76.78],

  // Japanese prefectures (major)
  'JP-13': [35.68, 139.69], 'JP-27': [34.69, 135.50], 'JP-14': [35.44, 139.64],
  'JP-23': [35.18, 136.91], 'JP-01': [43.06, 141.35], 'JP-26': [35.01, 135.77],
  'JP-40': [33.59, 130.40], 'JP-34': [34.40, 132.46],

  // Mexican states (major)
  'MX-CMX': [19.43, -99.13], 'MX-JAL': [20.67, -103.35], 'MX-NLE': [25.67, -100.31],
  'MX-BCN': [32.53, -117.02], 'MX-YUC': [20.97, -89.62],

  // Chinese provinces (major)
  'CN-BJ': [39.90, 116.40], 'CN-SH': [31.23, 121.47], 'CN-GD': [23.13, 113.26],
  'CN-HK': [22.32, 114.17], 'CN-TW': [25.03, 121.57], 'CN-MO': [22.20, 113.55],
  'CN-SC': [30.57, 104.07], 'CN-ZJ': [30.27, 120.15],

  // Spanish communities (major)
  'ES-MD': [40.42, -3.70], 'ES-CT': [41.39, 2.17], 'ES-AN': [37.39, -5.98],
  'ES-PV': [43.26, -2.93], 'ES-VC': [39.47, -0.38],

  // Italian regions (major)
  'IT-62': [41.90, 12.50], 'IT-25': [45.46, 9.19], 'IT-21': [45.07, 7.69],
  'IT-34': [45.44, 12.32], 'IT-72': [40.85, 14.27], 'IT-82': [38.12, 13.36],
};

export interface Coordinates {
  latitude: number;
  longitude: number;
  /** City name for display purposes. */
  city: string;
}

/** Capital city names for display, keyed by ISO 3166-1 code. */
const CAPITAL_NAMES: Record<string, string> = {
  AF: 'Kabul', AL: 'Tirana', DZ: 'Algiers', AD: 'Andorra la Vella', AO: 'Luanda',
  AG: "St. John's", AR: 'Buenos Aires', AM: 'Yerevan', AU: 'Canberra', AT: 'Vienna',
  AZ: 'Baku', BS: 'Nassau', BH: 'Manama', BD: 'Dhaka', BB: 'Bridgetown',
  BY: 'Minsk', BE: 'Brussels', BZ: 'Belmopan', BJ: 'Porto-Novo', BT: 'Thimphu',
  BO: 'La Paz', BA: 'Sarajevo', BW: 'Gaborone', BR: 'Brasília', BN: 'Bandar Seri Begawan',
  BG: 'Sofia', BF: 'Ouagadougou', BI: 'Gitega', CV: 'Praia', KH: 'Phnom Penh',
  CM: 'Yaoundé', CA: 'Ottawa', CF: 'Bangui', TD: "N'Djamena", CL: 'Santiago',
  CN: 'Beijing', CO: 'Bogotá', KM: 'Moroni', CG: 'Brazzaville', CD: 'Kinshasa',
  CR: 'San José', CI: 'Yamoussoukro', HR: 'Zagreb', CU: 'Havana', CY: 'Nicosia',
  CZ: 'Prague', DK: 'Copenhagen', DJ: 'Djibouti', DM: 'Roseau', DO: 'Santo Domingo',
  EC: 'Quito', EG: 'Cairo', SV: 'San Salvador', GQ: 'Malabo', ER: 'Asmara',
  EE: 'Tallinn', SZ: 'Mbabane', ET: 'Addis Ababa', FJ: 'Suva', FI: 'Helsinki',
  FR: 'Paris', GA: 'Libreville', GM: 'Banjul', GE: 'Tbilisi', DE: 'Berlin',
  GH: 'Accra', GR: 'Athens', GD: "St. George's", GT: 'Guatemala City', GN: 'Conakry',
  GW: 'Bissau', GY: 'Georgetown', HT: 'Port-au-Prince', HN: 'Tegucigalpa', HU: 'Budapest',
  IS: 'Reykjavik', IN: 'New Delhi', ID: 'Jakarta', IR: 'Tehran', IQ: 'Baghdad',
  IE: 'Dublin', IL: 'Jerusalem', IT: 'Rome', JM: 'Kingston', JP: 'Tokyo',
  JO: 'Amman', KZ: 'Astana', KE: 'Nairobi', KI: 'Tarawa', KP: 'Pyongyang',
  KR: 'Seoul', KW: 'Kuwait City', KG: 'Bishkek', LA: 'Vientiane', LV: 'Riga',
  LB: 'Beirut', LS: 'Maseru', LR: 'Monrovia', LY: 'Tripoli', LI: 'Vaduz',
  LT: 'Vilnius', LU: 'Luxembourg', MG: 'Antananarivo', MW: 'Lilongwe', MY: 'Kuala Lumpur',
  MV: 'Malé', ML: 'Bamako', MT: 'Valletta', MH: 'Majuro', MR: 'Nouakchott',
  MU: 'Port Louis', MX: 'Mexico City', FM: 'Palikir', MD: 'Chișinău', MC: 'Monaco',
  MN: 'Ulaanbaatar', ME: 'Podgorica', MA: 'Rabat', MZ: 'Maputo', MM: 'Naypyidaw',
  NA: 'Windhoek', NR: 'Yaren', NP: 'Kathmandu', NL: 'Amsterdam', NZ: 'Wellington',
  NI: 'Managua', NE: 'Niamey', NG: 'Abuja', MK: 'Skopje', NO: 'Oslo',
  OM: 'Muscat', PK: 'Islamabad', PW: 'Ngerulmud', PA: 'Panama City', PG: 'Port Moresby',
  PY: 'Asunción', PE: 'Lima', PH: 'Manila', PL: 'Warsaw', PT: 'Lisbon',
  QA: 'Doha', RO: 'Bucharest', RU: 'Moscow', RW: 'Kigali', KN: 'Basseterre',
  LC: 'Castries', VC: 'Kingstown', WS: 'Apia', SM: 'San Marino', ST: 'São Tomé',
  SA: 'Riyadh', SN: 'Dakar', RS: 'Belgrade', SC: 'Victoria', SL: 'Freetown',
  SG: 'Singapore', SK: 'Bratislava', SI: 'Ljubljana', SB: 'Honiara', SO: 'Mogadishu',
  ZA: 'Pretoria', SS: 'Juba', ES: 'Madrid', LK: 'Colombo', SD: 'Khartoum',
  SR: 'Paramaribo', SE: 'Stockholm', CH: 'Bern', SY: 'Damascus', TW: 'Taipei',
  TJ: 'Dushanbe', TZ: 'Dodoma', TH: 'Bangkok', TL: 'Dili', TG: 'Lomé',
  TO: 'Nukuʻalofa', TT: 'Port of Spain', TN: 'Tunis', TR: 'Ankara', TM: 'Ashgabat',
  TV: 'Funafuti', UG: 'Kampala', UA: 'Kyiv', AE: 'Abu Dhabi', GB: 'London',
  US: 'Washington, D.C.', UY: 'Montevideo', UZ: 'Tashkent', VU: 'Port Vila',
  VA: 'Vatican City', VE: 'Caracas', VN: 'Hanoi', YE: "Sana'a", ZM: 'Lusaka',
  ZW: 'Harare',
};

/**
 * Get coordinates for an ISO 3166 code (country or subdivision).
 * For subdivisions, falls back to the parent country's capital.
 */
export function getCoordinates(code: string): Coordinates | null {
  const upper = code.toUpperCase();

  // Try subdivision coordinates first
  if (upper.includes('-')) {
    const subCoords = SUBDIVISION_COORDS[upper];
    if (subCoords) {
      return { latitude: subCoords[0], longitude: subCoords[1], city: '' };
    }
    // Fall back to parent country
    const countryCode = upper.split('-')[0];
    const coords = COUNTRY_COORDS[countryCode];
    if (coords) {
      return { latitude: coords[0], longitude: coords[1], city: CAPITAL_NAMES[countryCode] ?? '' };
    }
    return null;
  }

  const coords = COUNTRY_COORDS[upper];
  if (!coords) return null;
  return { latitude: coords[0], longitude: coords[1], city: CAPITAL_NAMES[upper] ?? '' };
}
