/**
 * ISO 3166-2 subdivision names.
 *
 * Maps "CC-XX" codes to their common English name.
 * This doesn't aim to be exhaustive — it covers the most commonly referenced
 * subdivisions. Unknown codes are gracefully handled at runtime.
 */

/** US states and territories. */
const US: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia', AS: 'American Samoa', GU: 'Guam', MP: 'Northern Mariana Islands',
  PR: 'Puerto Rico', VI: 'U.S. Virgin Islands',
};

/** Canadian provinces and territories. */
const CA: Record<string, string> = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories',
  NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec',
  SK: 'Saskatchewan', YT: 'Yukon',
};

/** Australian states and territories. */
const AU: Record<string, string> = {
  ACT: 'Australian Capital Territory', NSW: 'New South Wales', NT: 'Northern Territory',
  QLD: 'Queensland', SA: 'South Australia', TAS: 'Tasmania', VIC: 'Victoria',
  WA: 'Western Australia',
};

/** UK countries and regions. */
const GB: Record<string, string> = {
  ENG: 'England', SCT: 'Scotland', WLS: 'Wales', NIR: 'Northern Ireland',
};

/** German states. */
const DE: Record<string, string> = {
  BW: 'Baden-Württemberg', BY: 'Bavaria', BE: 'Berlin', BB: 'Brandenburg',
  HB: 'Bremen', HH: 'Hamburg', HE: 'Hesse', MV: 'Mecklenburg-Vorpommern',
  NI: 'Lower Saxony', NW: 'North Rhine-Westphalia', RP: 'Rhineland-Palatinate',
  SL: 'Saarland', SN: 'Saxony', ST: 'Saxony-Anhalt', SH: 'Schleswig-Holstein',
  TH: 'Thuringia',
};

/** French regions. */
const FR: Record<string, string> = {
  ARA: 'Auvergne-Rhône-Alpes', BFC: 'Bourgogne-Franche-Comté', BRE: 'Brittany',
  CVL: 'Centre-Val de Loire', COR: 'Corsica', GES: 'Grand Est',
  HDF: 'Hauts-de-France', IDF: 'Île-de-France', NAQ: 'Nouvelle-Aquitaine',
  NOR: 'Normandy', OCC: 'Occitania', PDL: 'Pays de la Loire',
  PAC: "Provence-Alpes-Côte d'Azur",
};

/** Brazilian states. */
const BR: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Federal District', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins',
};

/** Indian states and union territories. */
const IN: Record<string, string> = {
  AN: 'Andaman and Nicobar Islands', AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh',
  AS: 'Assam', BR: 'Bihar', CH: 'Chandigarh', CT: 'Chhattisgarh',
  DD: 'Dadra and Nagar Haveli and Daman and Diu', DL: 'Delhi', GA: 'Goa',
  GJ: 'Gujarat', HR: 'Haryana', HP: 'Himachal Pradesh', JK: 'Jammu and Kashmir',
  JH: 'Jharkhand', KA: 'Karnataka', KL: 'Kerala', LA: 'Ladakh',
  MP: 'Madhya Pradesh', MH: 'Maharashtra', MN: 'Manipur', ML: 'Meghalaya',
  MZ: 'Mizoram', NL: 'Nagaland', OR: 'Odisha', PY: 'Puducherry',
  PB: 'Punjab', RJ: 'Rajasthan', SK: 'Sikkim', TN: 'Tamil Nadu',
  TG: 'Telangana', TR: 'Tripura', UP: 'Uttar Pradesh', UT: 'Uttarakhand',
  WB: 'West Bengal',
};

/** Japanese prefectures. */
const JP: Record<string, string> = {
  '01': 'Hokkaido', '02': 'Aomori', '03': 'Iwate', '04': 'Miyagi', '05': 'Akita',
  '06': 'Yamagata', '07': 'Fukushima', '08': 'Ibaraki', '09': 'Tochigi', '10': 'Gunma',
  '11': 'Saitama', '12': 'Chiba', '13': 'Tokyo', '14': 'Kanagawa', '15': 'Niigata',
  '16': 'Toyama', '17': 'Ishikawa', '18': 'Fukui', '19': 'Yamanashi', '20': 'Nagano',
  '21': 'Gifu', '22': 'Shizuoka', '23': 'Aichi', '24': 'Mie', '25': 'Shiga',
  '26': 'Kyoto', '27': 'Osaka', '28': 'Hyogo', '29': 'Nara', '30': 'Wakayama',
  '31': 'Tottori', '32': 'Shimane', '33': 'Okayama', '34': 'Hiroshima', '35': 'Yamaguchi',
  '36': 'Tokushima', '37': 'Kagawa', '38': 'Ehime', '39': 'Kochi', '40': 'Fukuoka',
  '41': 'Saga', '42': 'Nagasaki', '43': 'Kumamoto', '44': 'Oita', '45': 'Miyazaki',
  '46': 'Kagoshima', '47': 'Okinawa',
};

/** Mexican states. */
const MX: Record<string, string> = {
  AGU: 'Aguascalientes', BCN: 'Baja California', BCS: 'Baja California Sur',
  CAM: 'Campeche', CHP: 'Chiapas', CHH: 'Chihuahua', COA: 'Coahuila',
  COL: 'Colima', CMX: 'Mexico City', DUR: 'Durango', GUA: 'Guanajuato',
  GRO: 'Guerrero', HID: 'Hidalgo', JAL: 'Jalisco', MEX: 'State of Mexico',
  MIC: 'Michoacán', MOR: 'Morelos', NAY: 'Nayarit', NLE: 'Nuevo León',
  OAX: 'Oaxaca', PUE: 'Puebla', QUE: 'Querétaro', ROO: 'Quintana Roo',
  SLP: 'San Luis Potosí', SIN: 'Sinaloa', SON: 'Sonora', TAB: 'Tabasco',
  TAM: 'Tamaulipas', TLA: 'Tlaxcala', VER: 'Veracruz', YUC: 'Yucatán',
  ZAC: 'Zacatecas',
};

/** Italian regions. */
const IT: Record<string, string> = {
  '21': 'Piedmont', '23': 'Aosta Valley', '25': 'Lombardy', '32': 'Trentino-South Tyrol',
  '34': 'Veneto', '36': 'Friuli Venezia Giulia', '42': 'Liguria', '45': 'Emilia-Romagna',
  '52': 'Tuscany', '55': 'Umbria', '57': 'Marche', '62': 'Lazio', '65': 'Abruzzo',
  '67': 'Molise', '72': 'Campania', '75': 'Apulia', '77': 'Basilicata',
  '78': 'Calabria', '82': 'Sicily', '88': 'Sardinia',
};

/** Spanish autonomous communities. */
const ES: Record<string, string> = {
  AN: 'Andalusia', AR: 'Aragon', AS: 'Asturias', CB: 'Cantabria',
  CL: 'Castile and León', CM: 'Castilla–La Mancha', CN: 'Canary Islands',
  CT: 'Catalonia', EX: 'Extremadura', GA: 'Galicia', IB: 'Balearic Islands',
  MC: 'Region of Murcia', MD: 'Community of Madrid', NC: 'Navarre',
  PV: 'Basque Country', RI: 'La Rioja', VC: 'Valencian Community',
  CE: 'Ceuta', ML: 'Melilla',
};

/** Chinese provinces, municipalities, and regions. */
const CN: Record<string, string> = {
  AH: 'Anhui', BJ: 'Beijing', CQ: 'Chongqing', FJ: 'Fujian', GD: 'Guangdong',
  GS: 'Gansu', GX: 'Guangxi', GZ: 'Guizhou', HA: 'Henan', HB: 'Hubei',
  HE: 'Hebei', HI: 'Hainan', HK: 'Hong Kong', HL: 'Heilongjiang', HN: 'Hunan',
  JL: 'Jilin', JS: 'Jiangsu', JX: 'Jiangxi', LN: 'Liaoning', MO: 'Macau',
  NM: 'Inner Mongolia', NX: 'Ningxia', QH: 'Qinghai', SC: 'Sichuan',
  SD: 'Shandong', SH: 'Shanghai', SN: 'Shaanxi', SX: 'Shanxi', TJ: 'Tianjin',
  TW: 'Taiwan', XJ: 'Xinjiang', XZ: 'Tibet', YN: 'Yunnan', ZJ: 'Zhejiang',
};

/** All subdivision maps keyed by country code. */
const SUBDIVISIONS: Record<string, Record<string, string>> = {
  US, CA, AU, GB, DE, FR, BR, IN, JP, MX, IT, ES, CN,
};

/**
 * Subdivision names that need Wikipedia disambiguation.
 * Maps "CC-XX" → Wikipedia article title.
 */
const SUBDIVISION_WIKI_TITLES: Record<string, string> = {
  // US states that collide with country/other article names
  'US-GA': 'Georgia (U.S. state)',
  'US-IN': 'Indiana',
  'US-LA': 'Louisiana',
  'US-PA': 'Pennsylvania',
  'US-WA': 'Washington (state)',
  'US-DC': 'Washington, D.C.',
  'US-NY': 'New York (state)',
  // Canadian provinces
  'CA-QC': 'Quebec',
  // UK
  'GB-NIR': 'Northern Ireland',
  // India
  'IN-GA': 'Goa',
  'IN-PB': 'Punjab, India',
  'IN-DL': 'Delhi',
  'IN-BR': 'Bihar',
  // China
  'CN-HK': 'Hong Kong',
  'CN-MO': 'Macau',
  'CN-TW': 'Taiwan',
  'CN-XZ': 'Tibet',
  'CN-NM': 'Inner Mongolia',
  // Japan
  'JP-13': 'Tokyo',
  'JP-26': 'Kyoto',
  'JP-27': 'Osaka',
  // Brazil
  'BR-DF': 'Brazilian Federal District',
  'BR-RJ': 'Rio de Janeiro (state)',
  'BR-SP': 'São Paulo (state)',
  // Mexico
  'MX-CMX': 'Mexico City',
  'MX-MEX': 'State of Mexico',
};

/**
 * Look up the human-readable name for a subdivision code.
 * @param code Full ISO 3166-2 code, e.g. "US-TX"
 * @returns The subdivision name (e.g. "Texas") or null if unknown.
 */
export function getSubdivisionName(code: string): string | null {
  const upper = code.toUpperCase();
  const dashIdx = upper.indexOf('-');
  if (dashIdx === -1) return null;

  const countryCode = upper.slice(0, dashIdx);
  const subCode = upper.slice(dashIdx + 1);

  return SUBDIVISIONS[countryCode]?.[subCode] ?? null;
}

/**
 * Get the Wikipedia article title for a subdivision.
 * @param code Full ISO 3166-2 code, e.g. "US-TX"
 * @returns The Wikipedia title (e.g. "Texas") or null if unknown.
 */
export function getSubdivisionWikipediaTitle(code: string): string | null {
  const upper = code.toUpperCase();

  // Check explicit disambiguation map first
  const explicit = SUBDIVISION_WIKI_TITLES[upper];
  if (explicit) return explicit;

  // Fall back to subdivision name (works for most cases)
  return getSubdivisionName(upper);
}
