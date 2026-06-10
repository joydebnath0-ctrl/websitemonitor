document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('astrologyForm');
  const reportPanel = document.getElementById('reportPanel');
  const btnPrint = document.getElementById('btnPrint');
  const btnReset = document.getElementById('btnReset');
  const btnLangEn = document.getElementById('btnLangEn');
  const btnLangBn = document.getElementById('btnLangBn');

  let currentLang = 'en';
  let lastGeneratedData = null;

  // Astrological Data Mapping
  const ZODIAC_SIGNS = [
    { name: 'Aries', element: 'Fire', rulingPlanet: 'Mars', symbol: '♈' },
    { name: 'Taurus', element: 'Earth', rulingPlanet: 'Venus', symbol: '♉' },
    { name: 'Gemini', element: 'Air', rulingPlanet: 'Mercury', symbol: '♊' },
    { name: 'Cancer', element: 'Water', rulingPlanet: 'Moon', symbol: '♋' },
    { name: 'Leo', element: 'Fire', rulingPlanet: 'Sun', symbol: '♌' },
    { name: 'Virgo', element: 'Earth', rulingPlanet: 'Mercury', symbol: '♍' },
    { name: 'Libra', element: 'Air', rulingPlanet: 'Venus', symbol: '♎' },
    { name: 'Scorpio', element: 'Water', rulingPlanet: 'Mars/Pluto', symbol: '♏' },
    { name: 'Sagittarius', element: 'Fire', rulingPlanet: 'Jupiter', symbol: '♐' },
    { name: 'Capricorn', element: 'Earth', rulingPlanet: 'Saturn', symbol: '♑' },
    { name: 'Aquarius', element: 'Air', rulingPlanet: 'Saturn/Uranus', symbol: '♒' },
    { name: 'Pisces', element: 'Water', rulingPlanet: 'Jupiter/Neptune', symbol: '♓' }
  ];

  const HOUSE_COORDS = {
    1: { x: 160, y: 135, name: '1st House (Lagna)' },
    2: { x: 100, y: 70, name: '2nd House' },
    3: { x: 50, y: 120, name: '3rd House' },
    4: { x: 110, y: 180, name: '4th House' },
    5: { x: 50, y: 240, name: '5th House' },
    6: { x: 100, y: 290, name: '6th House' },
    7: { x: 160, y: 225, name: '7th House' },
    8: { x: 220, y: 290, name: '8th House' },
    9: { x: 270, y: 240, name: '9th House' },
    10: { x: 210, y: 180, name: '10th House' },
    11: { x: 270, y: 120, name: '11th House' },
    12: { x: 220, y: 70, name: '12th House' }
  };

  const WEEK_DAYS = {
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    bn: ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার']
  };

  const CITY_COORDS = {
    kolkata: { lat: 22.5726, lon: 88.3639, tz: 5.5 },
    calcutta: { lat: 22.5726, lon: 88.3639, tz: 5.5 },
    dhaka: { lat: 23.8103, lon: 90.4125, tz: 6.0 },
    london: { lat: 51.5074, lon: -0.1278, tz: 0.0 },
    newyork: { lat: 40.7128, lon: -74.0060, tz: -5.0 },
    delhi: { lat: 28.7041, lon: 77.1025, tz: 5.5 },
    newdelhi: { lat: 28.6139, lon: 77.2090, tz: 5.5 },
    mumbai: { lat: 19.0760, lon: 72.8777, tz: 5.5 },
    bombay: { lat: 19.0760, lon: 72.8777, tz: 5.5 },
    paris: { lat: 48.8566, lon: 2.3522, tz: 1.0 },
    tokyo: { lat: 35.6762, lon: 139.6503, tz: 9.0 },
    sydney: { lat: -33.8688, lon: 151.2093, tz: 10.0 }
  };

  // Translation Database
  const I18N = {
    en: {
      'header-title': 'Astrology Report Generator',
      'header-tagline': 'Discover your celestial blueprint',
      'label-name': 'Full Name',
      'label-place': 'Place of Birth',
      'label-dob': 'Date of Birth',
      'label-time': 'Time of Birth',
      'btn-generate': 'Generate Astrology Report',
      'tagline-born': 'Born on',
      'tagline-at': 'at',
      'tagline-in': 'in',
      'card-sunsign': 'Sun Sign (Zodiac)',
      'card-moonsign': 'Moon Sign',
      'card-ascendant': 'Ascendant (Rising)',
      'section-chart': 'Birth Chart (North Indian Kundli)',
      'section-elements': 'Elemental Balance',
      'el-fire': '🔥 Fire',
      'el-earth': '⛰️ Earth',
      'el-air': '💨 Air',
      'el-water': '💧 Water',
      'section-placements': 'Planetary Placements',
      'th-planet': 'Planet',
      'th-sign': 'Sign',
      'th-house': 'House',
      'th-degree': 'Degree',
      'th-element': 'Element',
      'read-sun-title': 'Sun Sign Interpretation',
      'read-asc-title': 'Rising Sign (Ascendant) Interpretation',
      'read-moon-title': 'Moon Sign (Emotional Core)',
      'section-dasha': 'Graha Dasha Timeline (Birth to Death)',
      'dasha-desc': 'Vimshottari Dasha calculations showing Maha Dasha and Antar Dasha cycles with yearly transits and remedies.',
      'th-age': 'Age',
      'th-year': 'Year',
      'th-mahadasha': 'Maha Dasha',
      'th-antardasha': 'Antar Dasha',
      'th-effects': 'Transit Effects',
      'th-action-remedy': 'Specific Remedy',
      'section-remedies': 'Recommended Astrological Remedies',
      'btn-reset': 'Reset Form',
      'btn-print': 'Print / Save PDF',
      'input-placeholder-name': 'Enter full name',
      'input-placeholder-place': 'City, State, Country (e.g., London, UK)',
      
      'Fire': 'Fire',
      'Earth': 'Earth',
      'Air': 'Air',
      'Water': 'Water',
      
      'Sun': 'Sun', 'Moon': 'Moon', 'Mercury': 'Mercury', 'Venus': 'Venus',
      'Mars': 'Mars', 'Jupiter': 'Jupiter', 'Saturn': 'Saturn', 'Ascendant': 'Ascendant',
      'Ketu': 'Ketu', 'Rahu': 'Rahu',
      
      'Aries': 'Aries', 'Taurus': 'Taurus', 'Gemini': 'Gemini', 'Cancer': 'Cancer',
      'Leo': 'Leo', 'Virgo': 'Virgo', 'Libra': 'Libra', 'Scorpio': 'Scorpio',
      'Sagittarius': 'Sagittarius', 'Capricorn': 'Capricorn', 'Aquarius': 'Aquarius', 'Pisces': 'Pisces',
      
      'House': 'House',
      'ruler': 'Ruler'
    },
    bn: {
      'header-title': 'অ্যাস্ট্রোলজি রিপোর্ট জেনারেটর',
      'header-tagline': 'আপনার মহাজাগতিক কুন্ডলী অনুসন্ধান করুন',
      'label-name': 'সম্পূর্ণ নাম',
      'label-place': 'জন্মস্থান',
      'label-dob': 'জন্মতারিখ',
      'label-time': 'জন্মের সময়',
      'btn-generate': 'কোষ্ঠী ও ফলাফল তৈরি করুন',
      'tagline-born': 'জন্মতারিখ',
      'tagline-at': 'সময়',
      'tagline-in': 'স্থান',
      'card-sunsign': 'রবি রাশি (Sun Sign)',
      'card-moonsign': 'চন্দ্র রাশি (Moon Sign)',
      'card-ascendant': 'লগ্ন (Ascendant)',
      'section-chart': 'জন্ম কুণ্ডলী (উত্তর ভারতীয় ছক)',
      'section-elements': 'পঞ্চভৌতিক বা পঞ্চতত্ত্বের ভারসাম্য',
      'el-fire': '🔥 অগ্নি তত্ত্ব',
      'el-earth': '⛰️ পৃথিবী তত্ত্ব',
      'el-air': '💨 বায়ু তত্ত্ব',
      'el-water': '💧 জল তত্ত্ব',
      'section-placements': 'গ্রহের অবস্থান ও বিবরণ',
      'th-planet': 'গ্রহ',
      'th-sign': 'রাশি',
      'th-house': 'ভাব (ঘর)',
      'th-degree': 'স্ফুট (ডিগ্রী)',
      'th-element': 'তত্ত্ব',
      'read-sun-title': 'রবি রাশির প্রভাব',
      'read-asc-title': 'লগ্নের প্রভাব ও ব্যক্তিত্ব',
      'read-moon-title': 'চন্দ্র রাশির প্রভাব (মানসিকতা)',
      'section-dasha': 'গ্রহের দশা ও অন্তর্দশা বিবরণ (জন্ম থেকে মৃত্যু)',
      'dasha-desc': 'জন্ম থেকে ১০০ বছর বয়স পর্যন্ত বিংশোত্তরী মহাদশা এবং অন্তর্দশার ফলাফল এবং প্রতিকার তালিকা।',
      'th-age': 'বয়স',
      'th-year': 'সাল',
      'th-mahadasha': 'মহাদশা',
      'th-antardasha': 'অন্তর্দশা',
      'th-effects': 'গোচর ফলাফল ও প্রভাব',
      'th-action-remedy': 'প্রয়োজনীয় প্রতিকার',
      'section-remedies': 'গুরুত্বপূর্ণ জ্যোতিষীয় প্রতিকার ও সমাধান',
      'btn-reset': 'ফর্ম মুছুন',
      'btn-print': 'মুদ্রণ / PDF সংরক্ষণ',
      'input-placeholder-name': 'আপনার নাম লিখুন',
      'input-placeholder-place': 'শহর, রাজ্য, দেশ (যেমন- কলকাতা, ভারত)',
      
      'Fire': 'অগ্নি',
      'Earth': 'ভূমি',
      'Air': 'বায়ু',
      'Water': 'জল',
      
      'Sun': 'সূর্য', 'Moon': 'চন্দ্র', 'Mercury': 'বুধ', 'Venus': 'শুক্র',
      'Mars': 'মঙ্গল', 'Jupiter': 'বৃহস্পতি', 'Saturn': 'শনি', 'Ascendant': 'লগ্ন',
      'Ketu': 'কেতু', 'Rahu': 'রাহু',
      
      'Aries': 'মেষ', 'Taurus': 'বৃষ', 'Gemini': 'মিথুন', 'Cancer': 'কর্কট',
      'Leo': 'সিংহ', 'Virgo': 'কন্যা', 'Libra': 'তুলা', 'Scorpio': 'বৃশ্চিক',
      'Sagittarius': 'ধনু', 'Capricorn': 'মকর', 'Aquarius': 'কুম্ভ', 'Pisces': 'মীন',
      
      'House': 'ভাব',
      'ruler': 'অধিপতি'
    }
  };

  const TRANSLATE = (key) => {
    return I18N[currentLang][key] || key;
  };

  // Language switcher event listeners
  btnLangEn.addEventListener('click', () => switchLanguage('en'));
  btnLangBn.addEventListener('click', () => switchLanguage('bn'));

  function switchLanguage(lang) {
    currentLang = lang;
    btnLangEn.classList.toggle('active', lang === 'en');
    btnLangBn.classList.toggle('active', lang === 'bn');
    
    document.querySelectorAll('[data-key]').forEach(el => {
      const key = el.getAttribute('data-key');
      el.textContent = TRANSLATE(key);
    });

    document.getElementById('birthName').setAttribute('placeholder', TRANSLATE('input-placeholder-name'));
    document.getElementById('birthPlace').setAttribute('placeholder', TRANSLATE('input-placeholder-place'));

    if (lastGeneratedData) {
      generateReport(lastGeneratedData);
    }
  }

  // Astronomical Calculations
  function getJulianDate(year, month, day, hours) {
    let Y = year;
    let M = month;
    if (M <= 2) {
      Y -= 1;
      M += 12;
    }
    const A = Math.floor(Y / 100);
    const B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + day + B - 1524.5 + hours / 24;
  }

  const PLANET_ELEMENTS = {
    Mercury: {
      a: [0.38709927, 0.00000037],
      e: [0.20563593, 0.00001906],
      i: [7.00497902, -0.00594749],
      L: [252.25032350, 149472.67411175],
      w: [77.45779628, 0.16047689],
      N: [48.33076593, -0.12534081]
    },
    Venus: {
      a: [0.72333566, 0.00000390],
      e: [0.00677672, -0.00004107],
      i: [3.39467605, -0.00078890],
      L: [181.97909950, 58517.81538729],
      w: [131.60246718, 0.00268329],
      N: [76.67984255, -0.27769418]
    },
    Earth: {
      a: [1.00000261, 0.00000562],
      e: [0.01671123, -0.00004392],
      i: [-0.00001531, -0.01294668],
      L: [100.46457166, 35999.37244981],
      w: [102.93768193, 0.32327364],
      N: [0.0, 0.0]
    },
    Mars: {
      a: [1.52371034, 0.00001847],
      e: [0.09339410, 0.00007882],
      i: [1.84969142, -0.00813131],
      L: [-4.55343205, 19140.30268499],
      w: [-23.94362959, 0.44441088],
      N: [49.55953891, -0.29257343]
    },
    Jupiter: {
      a: [5.20288700, -0.00011607],
      e: [0.04838624, -0.00013253],
      i: [1.30439695, -0.00183714],
      L: [34.39644051, 3034.74612775],
      w: [14.72847983, 0.21252668],
      N: [100.47390909, 0.20469106]
    },
    Saturn: {
      a: [9.53667594, -0.00125060],
      e: [0.05386179, -0.00050991],
      i: [2.48599187, 0.00193609],
      L: [49.95424423, 1222.49362201],
      w: [92.59887831, -0.41897216],
      N: [113.66242448, -0.28867794]
    }
  };

  function getHeliocentricPosition(planet, T) {
    const el = PLANET_ELEMENTS[planet];
    const a = el.a[0] + el.a[1] * T;
    const e = el.e[0] + el.e[1] * T;
    const i = (el.i[0] + el.i[1] * T) * Math.PI / 180;
    const L = (el.L[0] + el.L[1] * T) * Math.PI / 180;
    const varpi = (el.w[0] + el.w[1] * T) * Math.PI / 180;
    const Omega = (el.N[0] + el.N[1] * T) * Math.PI / 180;

    const omega = varpi - Omega;
    const M = L - varpi;

    let E = M;
    for (let iter = 0; iter < 10; iter++) {
      let delta = E - e * Math.sin(E) - M;
      if (Math.abs(delta) < 1e-7) break;
      E = E - delta / (1 - e * Math.cos(E));
    }

    const x_prime = a * (Math.cos(E) - e);
    const y_prime = a * Math.sqrt(1 - e * e) * Math.sin(E);

    const cos_omega = Math.cos(omega);
    const sin_omega = Math.sin(omega);
    const cos_Omega = Math.cos(Omega);
    const sin_Omega = Math.sin(Omega);
    const cos_i = Math.cos(i);
    const sin_i = Math.sin(i);

    const x = (cos_omega * cos_Omega - sin_omega * sin_Omega * cos_i) * x_prime
            + (-sin_omega * cos_Omega - cos_omega * sin_Omega * cos_i) * y_prime;
    const y = (cos_omega * sin_Omega + sin_omega * cos_Omega * cos_i) * x_prime
            + (-sin_omega * sin_Omega + cos_omega * cos_Omega * cos_i) * y_prime;
    const z = (sin_omega * sin_i) * x_prime + (cos_omega * sin_i) * y_prime;

    return { x, y, z };
  }

  function getMoonLongitude(d) {
    let L = 218.316 + 13.176396 * d;
    let M = 134.963 + 13.064993 * d;
    let D = 297.850 + 12.190749 * d;
    let F = 93.272 + 13.229350 * d;
    
    L = L % 360; M = M % 360; D = D % 360; F = F % 360;
    if (L < 0) L += 360;
    if (M < 0) M += 360;
    if (D < 0) D += 360;
    if (F < 0) F += 360;

    const M_rad = M * Math.PI / 180;
    const D_rad = D * Math.PI / 180;
    const F_rad = F * Math.PI / 180;

    let lambda = L 
      + 6.289 * Math.sin(M_rad) 
      - 1.274 * Math.sin(M_rad - 2 * D_rad) 
      + 0.658 * Math.sin(2 * D_rad) 
      + 0.214 * Math.sin(2 * M_rad)
      - 0.114 * Math.sin(2 * F_rad);

    lambda = lambda % 360;
    if (lambda < 0) lambda += 360;
    return lambda;
  }


  function formatDegree(deg) {
    const d = Math.floor(deg);
    const remMin = (deg - d) * 60;
    const m = Math.floor(remMin);
    const s = Math.round((remMin - m) * 60);
    return `${d.toString().padStart(2, '0')}° ${m.toString().padStart(2, '0')}' ${s.toString().padStart(2, '0')}"`;
  }

  function getHouseOfSign(ascSignIndex, targetSignIndex) {
    let diff = targetSignIndex - ascSignIndex;
    if (diff < 0) diff += 12;
    return diff + 1;
  }


  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('birthName').value.trim();
    const dobValue = document.getElementById('dob').value;
    const birthTime = document.getElementById('birthTime').value;
    const birthPlaceInput = document.getElementById('birthPlace').value.trim();

    if (!name || !dobValue || !birthTime) {
      alert(currentLang === 'en' ? 'Please fill out all required fields.' : 'দয়া করে সবগুলি প্রয়োজনীয় ফিল্ড পূরণ করুন।');
      return;
    }

    const dob = new Date(dobValue);
    const dayOfWeek = WEEK_DAYS[currentLang][dob.getDay()];

    // Resolve City Coordinates
    let lat = 22.5726; 
    let lon = 88.3639; 
    let tz = 5.5; 

    const cleanPlace = birthPlaceInput.toLowerCase().replace(/[^a-z]/g, '');
    if (CITY_COORDS[cleanPlace]) {
      lat = CITY_COORDS[cleanPlace].lat;
      lon = CITY_COORDS[cleanPlace].lon;
      tz = CITY_COORDS[cleanPlace].tz;
    } else {
      // Guess timezone offset from browser if place not found
      const localTzOffset = -new Date(dobValue).getTimezoneOffset() / 60;
      if (!isNaN(localTzOffset)) {
        tz = localTzOffset;
        lon = tz * 15; // Estimating longitude
      }
    }

    // Time calculations
    const [hours, minutes] = birthTime.split(':').map(Number);
    const UTCHours = hours - tz;
    
    // Julian Date Calculations
    const JD = getJulianDate(dob.getFullYear(), dob.getMonth() + 1, dob.getDate(), UTCHours);
    const d = JD - 2451545.0;

    // Ayanamsha (Lahiri)
    const ayanamsha = 23.85306 + 0.0001397 * d;
    const T = d / 36525;

    // Earth heliocentric position (used to compute geocentric position of other planets & Sun)
    const posE = getHeliocentricPosition('Earth', T);

    // Ecliptic Longitude Calculations (Tropical)
    const sunTrop = (Math.atan2(-posE.y, -posE.x) * 180 / Math.PI + 360) % 360;
    const moonTrop = getMoonLongitude(d);

    // Ecliptic Longitude Calculations (Sidereal)
    const sunSidereal = (sunTrop - ayanamsha + 360) % 360;
    const moonSidereal = (moonTrop - ayanamsha + 360) % 360;

    const sunSignIndex = Math.floor(sunSidereal / 30);
    const moonSignIndex = Math.floor(moonSidereal / 30);

    const sunSign = ZODIAC_SIGNS[sunSignIndex];
    const moonSign = ZODIAC_SIGNS[moonSignIndex];

    // Ascendant (Lagna) Ecliptic Calculation
    const GMST = (280.46061837 + 360.98564736629 * d) % 360;
    const LST = (GMST + lon + 360) % 360;
    const LST_rad = LST * Math.PI / 180;
    const eps_rad = 23.439 * Math.PI / 180;
    const lat_rad = lat * Math.PI / 180;

    const y = Math.sin(LST_rad);
    const x = Math.cos(LST_rad) * Math.cos(eps_rad) - Math.tan(lat_rad) * Math.sin(eps_rad);
    let ascTropical = Math.atan2(y, x) * 180 / Math.PI;
    if (ascTropical < 0) ascTropical += 360;

    const ascSidereal = (ascTropical - ayanamsha + 360) % 360;
    const ascSignIndex = Math.floor(ascSidereal / 30);
    const ascSign = ZODIAC_SIGNS[ascSignIndex];

    // Helper to calculate geocentric sidereal longitude for a planet
    const getPlanetSidereal = (planetName) => {
      const posP = getHeliocentricPosition(planetName, T);
      const x_geo = posP.x - posE.x;
      const y_geo = posP.y - posE.y;
      const lambda_geo = (Math.atan2(y_geo, x_geo) * 180 / Math.PI + 360) % 360;
      return (lambda_geo - ayanamsha + 360) % 360;
    };

    // Rahu and Ketu
    const RahuMeanL = 125.044522 - 1934.136261 * T + 0.002077 * T * T;
    let RahuTrop = RahuMeanL % 360;
    if (RahuTrop < 0) RahuTrop += 360;
    const RahuSidereal = (RahuTrop - ayanamsha + 360) % 360;
    const KetuSidereal = (RahuSidereal + 180) % 360;

    // Planetary Placements
    const planetPositions = {
      Sun: sunSidereal,
      Moon: moonSidereal,
      Ascendant: ascSidereal,
      Mercury: getPlanetSidereal('Mercury'),
      Venus: getPlanetSidereal('Venus'),
      Mars: getPlanetSidereal('Mars'),
      Jupiter: getPlanetSidereal('Jupiter'),
      Saturn: getPlanetSidereal('Saturn'),
      Rahu: RahuSidereal,
      Ketu: KetuSidereal
    };

    lastGeneratedData = {
      name,
      dobValue,
      birthTime,
      birthPlace: birthPlaceInput || 'Unknown',
      dayOfWeek,
      sunSign,
      ascSign,
      moonSign,
      sunSignIndex,
      ascSignIndex,
      moonSignIndex,
      planetPositions,
      birthYear: dob.getFullYear()
    };

    generateReport(lastGeneratedData);
  });

  btnReset.addEventListener('click', () => {
    reportPanel.style.display = 'none';
    lastGeneratedData = null;
    form.reset();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  btnPrint.addEventListener('click', () => {
    window.print();
  });

  // Generate Report View
  function generateReport(data) {
    document.getElementById('respName').innerText = data.name;
    document.getElementById('respDob').innerText = `${data.dobValue} (${data.dayOfWeek})`;
    document.getElementById('respTime').innerText = data.birthTime;
    document.getElementById('respPlace').innerText = data.birthPlace;

    document.getElementById('valSunSign').innerText = `${data.sunSign.symbol} ${TRANSLATE(data.sunSign.name)}`;
    document.getElementById('detailSunSign').innerText = `${TRANSLATE('th-element')}: ${TRANSLATE(data.sunSign.element)} | ${TRANSLATE('ruler')}: ${TRANSLATE(data.sunSign.rulingPlanet)}`;

    document.getElementById('valMoonSign').innerText = `${data.moonSign.symbol} ${TRANSLATE(data.moonSign.name)}`;
    document.getElementById('detailMoonSign').innerText = `${TRANSLATE('th-element')}: ${TRANSLATE(data.moonSign.element)} | ${TRANSLATE('ruler')}: ${TRANSLATE(data.moonSign.rulingPlanet)}`;

    document.getElementById('valAscendant').innerText = `${data.ascSign.symbol} ${TRANSLATE(data.ascSign.name)}`;
    document.getElementById('detailAscendant').innerText = `${TRANSLATE('th-element')}: ${TRANSLATE(data.ascSign.element)} | ${TRANSLATE('ruler')}: ${TRANSLATE(data.ascSign.rulingPlanet)}`;

    // Draw Birth Chart
    renderBirthChart(data.ascSignIndex, data.planetPositions);

    // Calculate Elements
    calculateElementalBalance(data.planetPositions);

    // Populate Placements Table
    populatePlacementsTable(data.planetPositions);

    // Render Graha Dasha Timeline (Age 0 to 100) using Nakshatra calculations
    renderDashaTimeline(data.planetPositions.Moon, data.birthYear);

    // Populate Remedies Section
    renderRemedies(data.moonSignIndex, data.sunSignIndex, data.ascSignIndex);

    // Populate Readings
    populateReadings(data);

    reportPanel.style.display = 'block';
  }

  // Draw North Indian Kundli SVG
  function renderBirthChart(ascIndex, planetPositions) {
    const svg = document.getElementById('chartSvg');
    svg.innerHTML = ''; 

    // Boundary lines
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '10'); rect.setAttribute('y', '10');
    rect.setAttribute('width', '300'); rect.setAttribute('height', '300');
    svg.appendChild(rect);

    const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line1.setAttribute('x1', '10'); line1.setAttribute('y1', '10');
    line1.setAttribute('x2', '310'); line1.setAttribute('y2', '310');
    svg.appendChild(line1);

    const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line2.setAttribute('x1', '10'); line2.setAttribute('y1', '310');
    line2.setAttribute('x2', '310'); line2.setAttribute('y2', '10');
    svg.appendChild(line2);

    const dLine1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    dLine1.setAttribute('x1', '160'); dLine1.setAttribute('y1', '10');
    dLine1.setAttribute('x2', '10'); dLine1.setAttribute('y2', '160');
    svg.appendChild(dLine1);

    const dLine2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    dLine2.setAttribute('x1', '10'); dLine2.setAttribute('y1', '160');
    dLine2.setAttribute('x2', '160'); dLine2.setAttribute('y2', '310');
    svg.appendChild(dLine2);

    const dLine3 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    dLine3.setAttribute('x1', '160'); dLine3.setAttribute('y1', '310');
    dLine3.setAttribute('x2', '310'); dLine3.setAttribute('y2', '160');
    svg.appendChild(dLine3);

    const dLine4 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    dLine4.setAttribute('x1', '310'); dLine4.setAttribute('y1', '160');
    dLine4.setAttribute('x2', '160'); dLine4.setAttribute('y2', '10');
    svg.appendChild(dLine4);

    const houseSigns = {};
    for (let house = 1; house <= 12; house++) {
      const signIndex = (ascIndex + (house - 1)) % 12;
      houseSigns[house] = signIndex + 1; 
    }

    const planetAbbreviations = {
      Sun: 'Su', Moon: 'Mo', Mercury: 'Me', Venus: 'Ve', Mars: 'Ma', Jupiter: 'Ju', Saturn: 'Sa', Rahu: 'Ra', Ketu: 'Ke'
    };

    const planetHouses = {};
    Object.keys(planetPositions).forEach(planet => {
      if (planet === 'Ascendant') return;
      const targetSignIndex = Math.floor(planetPositions[planet] / 30);
      planetHouses[planetAbbreviations[planet] || planet.substring(0,2)] = getHouseOfSign(ascIndex, targetSignIndex);
    });

    for (let house = 1; house <= 12; house++) {
      const coords = HOUSE_COORDS[house];
      
      const signText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      signText.setAttribute('x', coords.x.toString());
      signText.setAttribute('y', (coords.y - 12).toString());
      signText.setAttribute('class', 'house-num');
      signText.textContent = houseSigns[house].toString();
      svg.appendChild(signText);

      const planetsInHouse = Object.entries(planetHouses)
        .filter(([_, h]) => h === house)
        .map(([p, _]) => p);

      if (planetsInHouse.length > 0) {
        const planetText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        planetText.setAttribute('x', coords.x.toString());
        planetText.setAttribute('y', (coords.y + 8).toString());
        planetText.setAttribute('class', 'planet-tag');
        planetText.textContent = planetsInHouse.join(', ');
        svg.appendChild(planetText);
      }
    }
  }

  // Calculate Elemental Balance
  function calculateElementalBalance(planetPositions) {
    const points = { Fire: 0, Earth: 0, Air: 0, Water: 0 };
    
    // Weights: Ascendant (4pts), Sun (3pts), Moon (3pts), others (1.5pts)
    Object.keys(planetPositions).forEach(planet => {
      const lon = planetPositions[planet];
      const signIndex = Math.floor(lon / 30);
      const element = ZODIAC_SIGNS[signIndex].element;
      
      let weight = 1.5;
      if (planet === 'Ascendant') weight = 4.0;
      else if (planet === 'Sun' || planet === 'Moon') weight = 3.0;
      
      points[element] += weight;
    });

    const total = Object.values(points).reduce((a, b) => a + b, 0);

    const bars = {
      Fire: document.getElementById('barFire'),
      Earth: document.getElementById('barEarth'),
      Air: document.getElementById('barAir'),
      Water: document.getElementById('barWater')
    };

    const percentages = {
      Fire: document.getElementById('pctFire'),
      Earth: document.getElementById('pctEarth'),
      Air: document.getElementById('pctAir'),
      Water: document.getElementById('pctWater')
    };

    Object.keys(points).forEach((element) => {
      const pct = Math.round((points[element] / total) * 100);
      bars[element].style.width = `${pct}%`;
      percentages[element].innerText = `${pct}%`;
    });
  }

  // Populate Planetary Placements Table
  function populatePlacementsTable(planetPositions) {
    const tbody = document.querySelector('#placementsTable tbody');
    tbody.innerHTML = '';

    const planetsOrder = ['Sun', 'Moon', 'Ascendant', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Rahu', 'Ketu'];
    const ascSignIndex = Math.floor(planetPositions.Ascendant / 30);

    planetsOrder.forEach((planet) => {
      const lon = planetPositions[planet];
      const signIndex = Math.floor(lon / 30);
      const sign = ZODIAC_SIGNS[signIndex];
      const house = getHouseOfSign(ascSignIndex, signIndex);
      const deg = lon % 30;

      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${TRANSLATE(planet)}</strong></td>
        <td>${sign.symbol} ${TRANSLATE(sign.name)}</td>
        <td>${TRANSLATE('House')} ${house}</td>
        <td>${formatDegree(deg)}</td>
        <td>${TRANSLATE(sign.element)}</td>
      `;
      tbody.appendChild(row);
    });
  }

  // Vimshottari Yearly Dasha Timeline (based on Nakshatras)
  function renderDashaTimeline(moonLongitude, birthYear) {
    const tbody = document.querySelector('#dashaTable tbody');
    tbody.innerHTML = '';

    const dashaCycle = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
    const dashaYears = {
      Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17
    };

    // 27 Nakshatras of 13.333333 degrees each
    const nakshatraLength = 360 / 27;
    const nakshatraIndex = Math.floor(moonLongitude / nakshatraLength);
    
    // Mapping starting dasha
    const startCycleIndex = nakshatraIndex % 9;
    const startingPlanet = dashaCycle[startCycleIndex];
    
    // Calculate elapsed dasha years at birth
    const nakshatraProgress = (moonLongitude % nakshatraLength) / nakshatraLength;
    const elapsedYears = nakshatraProgress * dashaYears[startingPlanet];
    const remainingFirstDasha = dashaYears[startingPlanet] - elapsedYears;

    const dashaTimeline = [];
    
    // First dasha period
    dashaTimeline.push({
      planet: startingPlanet,
      startAge: 0,
      endAge: remainingFirstDasha
    });

    let currentAge = remainingFirstDasha;
    let cycleIndex = (startCycleIndex + 1) % 9;

    while (currentAge < 105) {
      const planet = dashaCycle[cycleIndex];
      const duration = dashaYears[planet];
      dashaTimeline.push({
        planet,
        startAge: currentAge,
        endAge: currentAge + duration
      });
      currentAge += duration;
      cycleIndex = (cycleIndex + 1) % 9;
    }

    // Antar Dashas Builder
    const ageTimeline = [];
    dashaTimeline.forEach(maha => {
      const length = maha.endAge - maha.startAge;
      let startAntarAge = maha.startAge;

      const startingIndex = dashaCycle.indexOf(maha.planet);
      for (let i = 0; i < 9; i++) {
        const antarPlanet = dashaCycle[(startingIndex + i) % 9];
        const antarDuration = (length * dashaYears[antarPlanet]) / 120;
        
        ageTimeline.push({
          mahadasha: maha.planet,
          antardasha: antarPlanet,
          startAge: startAntarAge,
          endAge: startAntarAge + antarDuration
        });
        startAntarAge += antarDuration;
      }
    });

    const dashaPredictions = {
      en: {
        Ketu: { effect: 'Detachment, spiritual interest, sudden updates in life.', remedy: 'Feed stray dogs or donate multi-color blankets.' },
        Venus: { effect: 'Luxury, relationship development, comfortable achievements, creative pursuits.', remedy: 'Respect women and donate white sweets on Fridays.' },
        Sun: { effect: 'Authority, high confidence, professional growth, potential ego clashes.', remedy: 'Offer water to the Sun daily in the morning.' },
        Moon: { effect: 'Mental peace, emotional sensitivity, intuitive power, mood swings.', remedy: 'Worship Lord Shiva on Mondays and drink milk from silver cups.' },
        Mars: { effect: 'Physical energy, courage, administrative success, risk of conflicts.', remedy: 'Recite Hanuman Chalisa on Tuesdays.' },
        Rahu: { effect: 'Sudden fortunes, illusion, curiosity, anxiety, changes in career.', remedy: 'Donate black sesame seeds on Saturdays.' },
        Jupiter: { effect: 'Spiritual growth, wisdom, educational success, financial expansion.', remedy: 'Respect mentors and donate yellow items on Thursdays.' },
        Saturn: { effect: 'Life lessons, delays, hard work rewards, disciplined structures.', remedy: 'Light a mustard oil lamp under a Peepal tree on Saturdays.' },
        Mercury: { effect: 'Business success, clear communication, intellectual expansion, learning.', remedy: 'Feed green grass to cows and worship Lord Ganesha.' }
      },
      bn: {
        Ketu: { effect: 'সংসার থেকে বৈরাগ্য ও আধ্যাত্মিক আগ্রহ বৃদ্ধি, আকস্মিক পরিবর্তন।', remedy: 'রাস্তার কুকুরদের খাওয়ান অথবা কম্বল দান করুন।' },
        Venus: { effect: 'বিলাসিতা, বৈবাহিক ও পারিবারিক সুখ বৃদ্ধি, কলার প্রতি অনুরাগ।', remedy: 'মহিলাদের সম্মান করুন এবং শুক্রবার সাদা মিষ্টি দান করুন।' },
        Sun: { effect: 'কর্তৃত্ব ও মান-সম্মান বৃদ্ধি, পেশাদারী উন্নতি, অহংকার বৃদ্ধি।', remedy: 'প্রতিদিন সকালে তামার পাত্রে সূর্যদেবকে জল অর্পণ করুন।' },
        Moon: { effect: 'মানসিক শান্তি ও সংবেদনশীলতা, নতুন পরিকল্পনা, মেজাজের তারতম্য।', remedy: 'সোমবার শিবের পূজা করুন এবং সম্ভব হলে রুপোর পাত্র ব্যবহার করুন।' },
        Mars: { effect: 'শারীরিক শক্তি, সাহস ও প্রশাসনিক ক্ষেত্রে উন্নতি, ঝগড়ার আশঙ্কা।', remedy: 'মঙ্গলবার হনুমান চালিসা পাঠ করুন এবং হনুমানজীর পূজা করুন।' },
        Rahu: { effect: 'অপ্রত্যাশিত লাভ বা ক্ষতি, বিভ্রান্তি, কাজের ক্ষেত্রে আকস্মিক মোড়।', remedy: 'শনিবার কালো তিল দান করুন ও অভাবী মানুষকে সাহায্য করুন।' },
        Jupiter: { effect: 'জ্ঞান ও আধ্যাত্মিক প্রসার, পড়াশোনায় সফলতা, ধনলাভ।', remedy: 'বৃহস্পতিবার গুরুজন ও শিক্ষকদের প্রণাম করুন এবং নিরামিষ আহার করুন।' },
        Saturn: { effect: 'কঠোর পরিশ্রমের পরীক্ষা, বিলম্ব, কাজের মাধ্যমে গুরুত্বপূর্ণ জীবনশিক্ষা।', remedy: 'শনিবার অশ্বত্থ গাছের তলায় সরষের তেলের প্রদীপ জ্বালান।' },
        Mercury: { effect: 'ব্যবসা ও বুদ্ধিবৃত্তিক উন্নতি, স্পষ্ট যোগাযোগ ও নতুন কিছু শেখার সুযোগ।', remedy: 'বুধবার গণেশ পূজা করুন ও গরুকে সবুজ ঘাস খাওয়ান।' }
      }
    };

    for (let age = 0; age <= 100; age++) {
      const midpointAge = age + 0.5;
      const activePeriod = ageTimeline.find(p => midpointAge >= p.startAge && midpointAge <= p.endAge) || ageTimeline[0];
      
      const mDasha = activePeriod.mahadasha;
      const aDasha = activePeriod.antardasha;
      const currentYear = birthYear + age;

      const predObj = dashaPredictions[currentLang][mDasha];
      const effectDesc = predObj.effect;
      const remedyDesc = predObj.remedy;

      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${age}</strong></td>
        <td>${currentYear}</td>
        <td><span style="color: var(--gold); font-weight: 600;">${TRANSLATE(mDasha)}</span></td>
        <td>${TRANSLATE(aDasha)}</td>
        <td>${effectDesc}</td>
        <td><em style="color: var(--muted); font-size: 13px;">${remedyDesc}</em></td>
      `;
      tbody.appendChild(row);
    }
  }

  // Populate Remedies Section
  function renderRemedies(moonSignIndex, sunSignIndex, ascIndex) {
    const remediesGrid = document.getElementById('remediesGrid');
    remediesGrid.innerHTML = '';

    const remediesData = {
      en: [
        {
          title: 'Gemstone Recommendation',
          desc: `Based on your Ascendant (${TRANSLATE(ZODIAC_SIGNS[ascIndex].name)}), your life-force planet suggests wearing a gemstone related to ${TRANSLATE(ZODIAC_SIGNS[ascIndex].rulingPlanet)} (after consultation) to enhance immunity, focus, and overall vitality.`
        },
        {
          title: 'Elemental Balancing Therapy',
          desc: `Your chart shows a unique mix of elements. Balance your energy by spending time in nature, practicing meditation under open skies (Air), drinking water from copper vessels (Water), or using warm light therapy (Fire) to align your doshas.`
        },
        {
          title: 'Vedic Mantra Meditation',
          desc: `To strengthen your emotional core (Moon in ${TRANSLATE(ZODIAC_SIGNS[moonSignIndex].name)}), chant the seed mantra of ${TRANSLATE(ZODIAC_SIGNS[moonSignIndex].rulingPlanet)} 108 times during sunrise. This resolves mental conflicts and reduces anxiety.`
        }
      ],
      bn: [
        {
          title: 'রত্ন ধারণের পরামর্শ',
          desc: `আপনার লগ্ন (${TRANSLATE(ZODIAC_SIGNS[ascIndex].name)}) অনুযায়ী আপনার অধিপতি গ্রহ ${TRANSLATE(ZODIAC_SIGNS[ascIndex].rulingPlanet)}-এর শুভ রত্ন ধারণের বিষয়ে জেনেশুনে পরামর্শ নিন। এটি আপনার জীবনীশক্তি, মনোযোগ ও সামগ্রিক উন্নতিতে সাহায্য করবে।`
        },
        {
          title: 'পঞ্চতত্ত্বের ভারসাম্য চিকিৎসা',
          desc: `আপনার কোষ্ঠীতে পঞ্চতত্ত্বের ভারসাম্যহীনতা দূর করতে নিয়মিত প্রকৃতির মাঝে সময় কাটান, খোলা আকাশের নিচে ধ্যান (বায়ু তত্ত্ব), তামার পাত্রে জল পান (জল তত্ত্ব) এবং সূর্যের আলোয় প্রাণায়াম (অগ্নি তত্ত্ব) করুন।`
        },
        {
          title: 'বৈদিক মন্ত্র জপ',
          desc: `আপনার মানসিক শক্তি বৃদ্ধিতে (${TRANSLATE(ZODIAC_SIGNS[moonSignIndex].name)} রাশিতে চন্দ্র) চন্দ্রের অধিপতি দেবতাকে স্মরণ করে এবং ${TRANSLATE(ZODIAC_SIGNS[moonSignIndex].rulingPlanet)}-এর বৈদিক বীজ মন্ত্র প্রতিদিন সকালে জপ করুন। এটি মনকে শান্ত করবে।`
        }
      ]
    };

    remediesData[currentLang].forEach(rem => {
      const div = document.createElement('div');
      div.className = 'reading-section';
      div.innerHTML = `
        <h4>${rem.title}</h4>
        <p>${rem.desc}</p>
      `;
      remediesGrid.appendChild(div);
    });
  }

  // Populate Readings
  function populateReadings(data) {
    const sunDetail = document.getElementById('sunSignReading');
    const ascDetail = document.getElementById('ascSignReading');
    const moonDetail = document.getElementById('moonSignReading');

    const sunReadings = {
      en: {
        Aries: 'Your Sun in Aries gives you an energetic, pioneering, and courageous spirit. You approach challenges head-on and thrive on action and initiative.',
        Taurus: 'With the Sun in Taurus, you possess determination, stability, and a deep appreciation for comfort. You value security and have a strong work ethic.',
        Gemini: 'Your Gemini Sun grants curiosity, adaptability, and intellectual charm. You love communicating, learning, and sharing ideas with others.',
        Cancer: 'With a Cancer Sun, you are deeply intuitive, emotional, and protective. You value home, family, and emotional connections above all.',
        Leo: 'Your Leo Sun brings warmth, generosity, and creative expression. You possess a natural leadership quality and a desire to be recognized.',
        Virgo: 'Your Sun in Virgo gives you analytical skills, detail orientation, and a desire to serve. You strive for perfection and practical order.',
        Libra: 'With the Sun in Libra, you seek harmony, balance, and artistic beauty. You are natural at relationships and weigh decisions carefully.',
        Scorpio: 'Your Scorpio Sun brings intensity, passion, and deep emotional strength. You are secretive, investigative, and transformational.',
        Sagittarius: 'Your Sagittarius Sun grants optimism, love for freedom, and philosophical curiosity. You seek truth, travel, and adventure.',
        Capricorn: 'With a Capricorn Sun, you possess ambition, discipline, and respect for tradition. You climb steadily towards your goals with responsibility.',
        Aquarius: 'Your Aquarius Sun gives you humanitarian values, originality, and intellectual independence. You value community and progressive ideas.',
        Pisces: 'With the Sun in Pisces, you are artistic, spiritual, and highly empathetic. You easily absorb the energy of others and flow with life\'s currents.'
      },
      bn: {
        Aries: 'মেষ রাশিতে সূর্যের অবস্থানের কারণে আপনার মধ্যে অফুরন্ত শক্তি, সাহস এবং নেতৃত্বের গুণাবলি দেখা যায়। আপনি সমস্ত বাধা দূর করতে ভালোবাসেন।',
        Taurus: 'বৃষ রাশিতে সূর্যের অবস্থান আপনাকে দৃঢ় প্রতিজ্ঞ, ধৈর্যশীল এবং জীবন উপভোগী করে তোলে। আপনি স্থায়িত্ব ও অর্থনৈতিক নিরাপত্তাকে গুরুত্ব দেন।',
        Gemini: 'মিথুন রাশিতে সূর্যের অবস্থানের কারণে আপনি কৌতুহলী, মিশুকে ও বুদ্ধিদীপ্ত ব্যক্তিত্বের অধিকারী। কথা বলতে ও নতুন বিষয় শিখতে ভালোবাসেন।',
        Cancer: 'কর্কট রাশিতে সূর্য আপনাকে অত্যন্ত সংবেদনশীল, অনুভূতিপ্রবণ এবং পরিবারের প্রতি যত্নশীল করে তোলে। আপনি সম্পর্ককে মন থেকে ভালোবাসেন।',
        Leo: 'সিংহ রাশিতে সূর্যের কারণে আপনার মধ্যে তেজ, আত্মমর্যাদা, উদারতা ও শিল্প মনস্কতা প্রকাশ পায়। আপনি সব জায়গায় নেতৃত্ব দিতে আগ্রহী হন।',
        Virgo: 'কন্যা রাশিতে সূর্য আপনার মধ্যে নিখুঁত বিশ্লেষণ ক্ষমতা, নিয়মানুবর্তিতা ও সেবার মানসিকতা তৈরি করে। আপনি বাস্তববাদী হয়ে থাকেন।',
        Libra: 'তুলা রাশিতে সূর্য আপনার মধ্যে সামঞ্জস্য, শৈল্পিক সৌন্দর্য ও সম্পর্কের গভীরতা বাড়িয়ে তোলে। আপনি শান্তিপূর্ণ জীবনযাপন করতে ভালোবাসেন।',
        Scorpio: 'বৃশ্চিক রাশিতে সূর্য আপনাকে গভীর চিন্তাশীল, রহস্যময় ও প্রচণ্ড ইচ্ছাশক্তির অধিকারী করে তোলে। আপনি নিজের কথা লুকিয়ে রাখতে ভালোবাসেন।',
        Sagittarius: 'ধনু রাশিতে সূর্যের কারণে আপনি আশাবাদী, জ্ঞানপিপাসু ও ভ্রমণপ্রেমী হন। আধ্যাত্মিকতা ও নতুন অভিজ্ঞতার প্রতি আপনার ঝোঁক থাকে।',
        Capricorn: 'মকর রাশিতে সূর্য আপনাকে উচ্চাকাঙ্ক্ষী, নিয়মানুবর্তী ও দায়িত্বশীল করে তোলে। আপনি কর্মক্ষেত্রে সাফল্য অর্জন করতে ভালোবাসেন।',
        Aquarius: 'কুম্ভ রাশিতে সূর্য আপনাকে সমাজসেবী, স্বাধীনচেতা ও প্রগতিশীল চিন্তার অধিকারী করে তোলে। আপনি বন্ধুদের নিয়ে কাজ করতে পছন্দ করেন।',
        Pisces: 'মীন রাশিতে সূর্য আপনাকে অত্যন্ত দয়ালু, শিল্পপ্রেমী ও আধ্যাত্মিক মনের অধিকারী করে তোলে। আপনি অন্যের দুঃখ সহজেই অনুভব করতে পারেন।'
      }
    };

    const ascReadings = {
      en: {
        Aries: 'Aries Rising projects a dynamic, independent, and direct personality. You make a strong first impression and love taking charge.',
        Taurus: 'Taurus Rising projects calm, reliability, and visual elegance. People perceive you as stable, sensible, and grounded.',
        Gemini: 'Gemini Rising projects high energy, talkativeness, and quick wit. You appear youthful, curious, and socially engaging.',
        Cancer: 'Cancer Rising projects warm, gentle, and nurturing vibes. You appear approachable, sensitive, and deeply caring.',
        Leo: 'Leo Rising projects confidence, dramatic style, and a commanding presence. You have a warm heart and easily draw attention.',
        Virgo: 'Virgo Rising projects modesty, precision, and intelligence. You look neat, reliable, and helpful in social settings.',
        Libra: 'Libra Rising projects social grace, charm, and diplomatic skills. You make a polished, appealing first impression.',
        Scorpio: 'Scorpio Rising projects mystery, quiet intensity, and magnetic charm. People find you perceptive and highly capable.',
        Sagittarius: 'Sagittarius Rising projects open-mindedness, high spirits, and a jovial attitude. You look adventurous and friendly.',
        Capricorn: 'Capricorn Rising projects capability, control, and professional maturity. You look serious, disciplined, and reliable.',
        Aquarius: 'Aquarius Rising projects unique style, intellectual focus, and friendliness. You appear independent, eccentric, and open.',
        Pisces: 'Pisces Rising projects dreaminess, artistic sensitivity, and gentle warmth. You look quiet, intuitive, and spiritually oriented.'
      },
      bn: {
        Aries: 'মেষ লগ্ন আপনাকে প্রগতিশীল, সাহসী ও স্বাধীন মনোভাবের অধিকারী করে তোলে। আপনি জীবনের সব ক্ষেত্রে দ্রুত সিদ্ধান্ত নিতে পারেন।',
        Taurus: 'বৃষ লগ্ন আপনাকে শান্ত, নির্ভরযোগ্য ও শৈল্পিক স্বভাবের করে তোলে। মানুষ আপনাকে অত্যন্ত বাস্তববাদী ও বিশ্বস্ত বলে মনে করে।',
        Gemini: 'মিথুন লগ্ন আপনাকে অত্যন্ত চটপটে, বাচাল ও বুদ্ধিদীপ্ত করে তোলে। আপনি যেকোনো সামাজিক পরিবেশে সহজেই মিশে যেতে পারেন।',
        Cancer: 'কর্কট লগ্ন আপনাকে অত্যন্ত দয়ালু, আবেগপ্রবণ ও রক্ষণশীল করে তোলে। আপনি আপনার চারপাশের মানুষের যত্ন নিতে ভালোবাসেন।',
        Leo: 'সিংহ লগ্ন আপনাকে আত্মবিশ্বাসী, তেজস্বী ও প্রভাবশালী ব্যক্তিত্বের অধিকারী করে। আপনার উপস্থিতি সহজেই মানুষের আকর্ষণ কাড়ে।',
        Virgo: 'কন্যা লগ্ন আপনাকে পরিপাটি, বিনয়ী ও বিচক্ষণ হিসেবে উপস্থাপন করে। আপনি খুঁটিনাটি সব কাজের প্রতি গভীর মনোযোগ দিতে পারেন।',
        Libra: 'তুলা লগ্ন আপনাকে মিষ্টি স্বভাবের, কূটনৈতিক ও রুচিশীল মানুষ হিসেবে ফুটিয়ে তোলে। আপনি সৌন্দর্য ও ভারসাম্যের ভক্ত হন।',
        Scorpio: 'বৃশ্চিক লগ্ন আপনাকে রহস্যময়, গম্ভীর ও অপ্রতিরোধ্য চরিত্রের অধিকারী করে তোলে। আপনার চাউনি ও প্রকাশ তীব্র হয়।',
        Sagittarius: 'ধনু লগ্ন আপনাকে বন্ধুবৎসল, স্বাধীনচেতা ও আশাবাদী করে তোলে। আপনি নতুন কোনো লক্ষ্য অন্বেষণ করতে ভালোবাসেন।',
        Capricorn: 'মকর লগ্ন আপনাকে অত্যন্ত গম্ভীর, পরিপক্ক ও লক্ষ্যমুখী করে তোলে। আপনি অল্প বয়স থেকেই ক্যারিয়ার বা कर्तव्य সচেতন হন।',
        Aquarius: 'কুম্ভ লগ্ন আপনাকে অনন্য ব্যক্তিত্বের, বৈপ্লবিক চিন্তাধারার ও উদার মনের মানুষ করে তোলে। আপনি প্রথা ভাঙতে পছন্দ করেন।',
        Pisces: 'মীন লগ্ন আপনাকে স্বপ্নালু, ভাবুক ও আধ্যাত্মিক করে তোলে। মানুষ আপনাকে সহজে বিশ্বাস করতে পারে এবং আপনার সাথে স্বাচ্ছন্দ্য বোধ করে।'
      }
    };

    const moonReadings = {
      en: {
        Aries: 'Your Moon in Aries shows that your emotional responses are quick, passionate, and impatient. You feel things with high intensity.',
        Taurus: 'With a Taurus Moon, your emotional nature is steady, peaceful, and rooted in physical comfort. You require structure to feel safe.',
        Gemini: 'Your Gemini Moon makes you emotionally communicative. You process your feelings by talking about them and analyzing them.',
        Cancer: 'Your Moon in Cancer is in its home placement. You feel things deeply, possess powerful intuition, and are highly sensitive.',
        Leo: 'A Leo Moon indicates that your feelings are warm, proud, and creative. You seek appreciation, love, and respect in relationships.',
        Virgo: 'Your Virgo Moon shows a need for emotional order and helpfulness. You show care by organizing and solving practical problems.',
        Libra: 'With a Libra Moon, you feel emotionally secure when your relationships are peaceful. Conflict or harshness upsets you deeply.',
        Scorpio: 'Your Scorpio Moon brings intense, private, and passionate emotions. You have a profound ability to see the hidden truth in others.',
        Sagittarius: 'A Sagittarius Moon shows an optimistic, freedom-loving emotional core. You need space and adventure to remain happy.',
        Capricorn: 'Your Capricorn Moon indicates that you keep your feelings structured and controlled. You value reliability and practical achievements.',
        Aquarius: 'An Aquarius Moon shows an independent and observant emotional style. You care about group needs but keep personal distance.',
        Pisces: 'Your Pisces Moon gives you deep emotional empathy and a strong imagination. You absorb feelings and need creative or spiritual outlets.'
      },
      bn: {
        Aries: 'মেষ রাশিতে মনের অবস্থানের জন্য আপনি আবেগের ক্ষেত্রে খুব দ্রুত, অস্থির ও আবেগপ্রবণ হয়ে পড়েন। আপনি সহজেই উত্তেজিত হতে পারেন।',
        Taurus: 'বৃষ রাশিতে মন থাকার ফলে আপনার মানসিকতা খুবই শান্ত, সংযত ও আরামপ্রিয় হয়। মানসিক শান্তির জন্য আপনি স্থায়িত্ব খোঁজেন।',
        Gemini: 'মিথুন রাশিতে চন্দ্র আপনাকে মানসিক দিক থেকে চঞ্চল ও যুক্তিবাদী করে তোলে। আপনি আবেগ দিয়ে না ভেবে কথা বলে মন হালকা করতে পছন্দ করেন।',
        Cancer: 'কর্কট রাশিতে চন্দ্র স্বক্ষেত্রগত। আপনার আবেগ খুবই গভীর, আপনি অত্যন্ত সহানুভূতিশীল এবং পরিবারকে ঘিরেই আপনার সুখ থাকে।',
        Leo: 'সিংহ রাশিতে চন্দ্র থাকলে আপনার আবেগে একটা রাজকীয় আভিজাত্য থাকে। আপনি আপনার কাজ ও সম্পর্কের জন্য সম্মান ও স্বীকৃতি চান।',
        Virgo: 'কন্যা রাশিতে চন্দ্র থাকলে আপনি মনের শান্তি খুঁজে পান শৃঙ্খলা ও অন্যের উপকারের মাঝে। কোনো সমস্যা সমাধান করতে পারলে আপনি আনন্দ পান।',
        Libra: 'তুলা রাশিতে চন্দ্র আপনার মনে প্রেমের ও শান্তির উদ্রেক করে। সম্পর্কের টানাপড়েন বা কোনো অশান্তি আপনাকে গভীরভাবে বিচলিত করে।',
        Scorpio: 'বৃশ্চিক রাশিতে চন্দ্র আপনার আবেগ ও অনুভূতিকে অত্যন্ত তীব্র ও গোপন করে তোলে। আপনি মানুষের আসল চরিত্র সহজেই বুঝতে পারেন।',
        Sagittarius: 'ধনু রাশিতে চন্দ্র আপনাকে মানসিকভাবে আনন্দিত ও স্বাধীনচেতা রাখে। মানসিক সুস্থতার জন্য আপনার কিছুটা স্বাধীনতা ও ভ্রমণের প্রয়োজন।',
        Capricorn: 'মকর রাশিতে চন্দ্র আপনার আবেগকে কিছুটা নিয়ন্ত্রণে রাখতে শেখায়। আপনি সবসময় কর্তব্যনিষ্ঠ ও দায়িত্বশীল থাকতে ভালোবাসেন।',
        Aquarius: 'কুম্ভ রাশিতে চন্দ্র আপনাকে সবার সাথে বন্ধুত্বপূর্ণ অথচ নিজের আবেগের দিক থেকে কিছুটা নিঃসঙ্গ ও নির্লিপ্ত করে তোলে।',
        Pisces: 'মীন রাশিতে চন্দ্র থাকার অর্থ আপনার কল্পনাশক্তি ও করুণা খুবই বেশি। আপনি মানুষের দুঃখ সহজে ভাগ করে নিতে পছন্দ করেন।'
      }
    };

    sunDetail.innerText = sunReadings[currentLang][data.sunSign.name];
    ascDetail.innerText = ascReadings[currentLang][data.ascSign.name];
    moonDetail.innerText = moonReadings[currentLang][data.moonSign.name];
  }
});
