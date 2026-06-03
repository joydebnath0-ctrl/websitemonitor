document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('astrologyForm');
  const reportPanel = document.getElementById('reportPanel');
  const btnPrint = document.getElementById('btnPrint');
  const btnReset = document.getElementById('btnReset');

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

  const WEEK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('birthName').value.trim();
    const dobValue = document.getElementById('dob').value;
    const birthTime = document.getElementById('birthTime').value;
    const birthPlace = document.getElementById('birthPlace').value.trim() || 'Unknown';

    if (!name || !dobValue || !birthTime) {
      alert('Please fill out all required fields.');
      return;
    }

    const dob = new Date(dobValue);
    const dayOfWeek = WEEK_DAYS[dob.getDay()];

    // Astrological Calculations
    const sunSignIndex = calculateSunSign(dob.getMonth() + 1, dob.getDate());
    const sunSign = ZODIAC_SIGNS[sunSignIndex];

    const ascSignIndex = calculateAscendant(sunSignIndex, birthTime);
    const ascSign = ZODIAC_SIGNS[ascSignIndex];

    const moonSignIndex = calculateMoonSign(dob, birthTime);
    const moonSign = ZODIAC_SIGNS[moonSignIndex];

    // Build Report Details
    generateReport({
      name,
      dobValue,
      birthTime,
      birthPlace,
      dayOfWeek,
      sunSign,
      ascSign,
      moonSign,
      sunSignIndex,
      ascSignIndex,
      moonSignIndex
    });
  });

  btnReset.addEventListener('click', () => {
    reportPanel.style.display = 'none';
    form.reset();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  btnPrint.addEventListener('click', () => {
    window.print();
  });

  // Calculate Sun Sign based on Month & Day
  function calculateSunSign(month, day) {
    if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return 0; // Aries
    if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return 1; // Taurus
    if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return 2; // Gemini
    if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return 3; // Cancer
    if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return 4; // Leo
    if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return 5; // Virgo
    if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return 6; // Libra
    if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return 7; // Scorpio
    if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return 8; // Sagittarius
    if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return 9; // Capricorn
    if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return 10; // Aquarius
    return 11; // Pisces
  }

  // Calculate Rising Sign (Ascendant) based on Sunrise (~6 AM) and Birth Time
  function calculateAscendant(sunSignIndex, timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const birthHour = hours + minutes / 60;
    
    // Sunrise is roughly 6:00 AM. 
    // The ascendant matches the Sun sign at sunrise and advances 1 sign every 2 hours.
    let hoursPastSunrise = birthHour - 6;
    if (hoursPastSunrise < 0) {
      hoursPastSunrise += 24; // Handle night hours
    }
    
    const signsMoved = Math.floor(hoursPastSunrise / 2);
    return (sunSignIndex + signsMoved) % 12;
  }

  // Estimate Moon Sign using Date and Time (approximate cycle of 2.25 days per sign)
  function calculateMoonSign(dob, timeStr) {
    // Reference date: Jan 1, 2000 (Moon was in Scorpio - Sign Index 7)
    const refDate = new Date('2000-01-01T00:00:00');
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    const birthDate = new Date(dob);
    birthDate.setHours(hours, minutes);

    const diffMs = birthDate.getTime() - refDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    
    // Moon cycle is roughly 27.3 days, meaning it spends ~2.275 days in each sign
    const daysInSign = 2.275;
    const signsOffset = Math.floor(diffDays / daysInSign);
    
    let moonIndex = (7 + signsOffset) % 12;
    if (moonIndex < 0) moonIndex += 12;
    return moonIndex;
  }

  // Generate Report View
  function generateReport(data) {
    // Populate Profile Card Values
    document.getElementById('respName').innerText = data.name;
    document.getElementById('respDob').innerText = `${data.dobValue} (${data.dayOfWeek})`;
    document.getElementById('respTime').innerText = data.birthTime;
    document.getElementById('respPlace').innerText = data.birthPlace;

    document.getElementById('valSunSign').innerText = `${data.sunSign.symbol} ${data.sunSign.name}`;
    document.getElementById('detailSunSign').innerText = `Element: ${data.sunSign.element} | Ruler: ${data.sunSign.rulingPlanet}`;

    document.getElementById('valMoonSign').innerText = `${data.moonSign.symbol} ${data.moonSign.name}`;
    document.getElementById('detailMoonSign').innerText = `Element: ${data.moonSign.element} | Ruler: ${data.moonSign.rulingPlanet}`;

    document.getElementById('valAscendant').innerText = `${data.ascSign.symbol} ${data.ascSign.name}`;
    document.getElementById('detailAscendant').innerText = `Element: ${data.ascSign.element} | Ruler: ${data.ascSign.rulingPlanet}`;

    // Draw Birth Chart (Kundli)
    renderBirthChart(data.ascSignIndex, data.sunSignIndex, data.moonSignIndex);

    // Calculate Elements
    calculateElementalBalance(data.sunSignIndex, data.moonSignIndex, data.ascSignIndex);

    // Populate Placements Table
    populatePlacementsTable(data);

    // Populate Readings
    populateReadings(data);

    // Display Report
    reportPanel.style.display = 'block';
    reportPanel.scrollIntoView({ behavior: 'smooth' });
  }

  // Draw North Indian Kundli SVG
  function renderBirthChart(ascIndex, sunIndex, moonIndex) {
    const svg = document.getElementById('chartSvg');
    svg.innerHTML = ''; // Clear previous chart drawings

    // Draw Boundary Box (320x320 px)
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '10');
    rect.setAttribute('y', '10');
    rect.setAttribute('width', '300');
    rect.setAttribute('height', '300');
    svg.appendChild(rect);

    // Diagonal Lines (X shape)
    const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line1.setAttribute('x1', '10');
    line1.setAttribute('y1', '10');
    line1.setAttribute('x2', '310');
    line1.setAttribute('y2', '310');
    svg.appendChild(line1);

    const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line2.setAttribute('x1', '10');
    line2.setAttribute('y1', '310');
    line2.setAttribute('x2', '310');
    line2.setAttribute('y2', '10');
    svg.appendChild(line2);

    // Diamond Lines (Diamond shape connecting midpoints)
    const dLine1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    dLine1.setAttribute('x1', '160');
    dLine1.setAttribute('y1', '10');
    dLine1.setAttribute('x2', '10');
    dLine1.setAttribute('y2', '160');
    svg.appendChild(dLine1);

    const dLine2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    dLine2.setAttribute('x1', '10');
    dLine2.setAttribute('y1', '160');
    dLine2.setAttribute('x2', '160');
    dLine2.setAttribute('y2', '310');
    svg.appendChild(dLine2);

    const dLine3 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    dLine3.setAttribute('x1', '160');
    dLine3.setAttribute('y1', '310');
    dLine3.setAttribute('x2', '310');
    dLine3.setAttribute('y2', '160');
    svg.appendChild(dLine3);

    const dLine4 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    dLine4.setAttribute('x1', '310');
    dLine4.setAttribute('y1', '160');
    dLine4.setAttribute('x2', '160');
    dLine4.setAttribute('y2', '10');
    svg.appendChild(dLine4);

    // Map houses to sign numbers starting with Lagna (1st House)
    const houseSigns = {};
    for (let house = 1; house <= 12; house++) {
      const signIndex = (ascIndex + (house - 1)) % 12;
      houseSigns[house] = signIndex + 1; // 1-indexed sign number (Aries=1, etc.)
    }

    // Place Planets in Houses
    // Mock placements based on birth chart signs
    const planetHouses = {
      'Asc': 1,
      'Su': getHouseOfSign(ascIndex, sunIndex),
      'Mo': getHouseOfSign(ascIndex, moonIndex),
      'Me': getHouseOfSign(ascIndex, (sunIndex + 1) % 12), // Mercury is always close to Sun
      'Ve': getHouseOfSign(ascIndex, (sunIndex - 1 + 12) % 12), // Venus is close to Sun
      'Ma': getHouseOfSign(ascIndex, (moonIndex + 2) % 12),
      'Ju': getHouseOfSign(ascIndex, (ascIndex + 4) % 12),
      'Sa': getHouseOfSign(ascIndex, (ascIndex + 8) % 12)
    };

    // Render house sign numbers and planets
    for (let house = 1; house <= 12; house++) {
      const coords = HOUSE_COORDS[house];
      
      // Draw House Number (Sign)
      const signText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      signText.setAttribute('x', coords.x.toString());
      signText.setAttribute('y', (coords.y - 12).toString());
      signText.setAttribute('class', 'house-num');
      signText.textContent = houseSigns[house].toString();
      svg.appendChild(signText);

      // Collect planets in this house
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

  function getHouseOfSign(ascSignIndex, targetSignIndex) {
    let diff = targetSignIndex - ascSignIndex;
    if (diff < 0) diff += 12;
    return diff + 1; // 1-indexed house
  }

  // Calculate Elemental Balance (Fire, Earth, Air, Water)
  function calculateElementalBalance(sunIndex, moonIndex, ascIndex) {
    const points = { Fire: 0, Earth: 0, Air: 0, Water: 0 };
    
    // Add weights: Ascendant (4pts), Sun (3pts), Moon (3pts)
    points[ZODIAC_SIGNS[ascIndex].element] += 4;
    points[ZODIAC_SIGNS[sunIndex].element] += 3;
    points[ZODIAC_SIGNS[moonIndex].element] += 3;

    // Map remaining planets to add some extra details
    points[ZODIAC_SIGNS[(sunIndex + 1) % 12].element] += 1.5; // Mercury
    points[ZODIAC_SIGNS[(sunIndex - 1 + 12) % 12].element] += 1.5; // Venus
    points[ZODIAC_SIGNS[(moonIndex + 2) % 12].element] += 1.5; // Mars
    points[ZODIAC_SIGNS[(ascIndex + 4) % 12].element] += 1.5; // Jupiter
    points[ZODIAC_SIGNS[(ascIndex + 8) % 12].element] += 1.5; // Saturn

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
  function populatePlacementsTable(data) {
    const tbody = document.querySelector('#placementsTable tbody');
    tbody.innerHTML = '';

    const placements = [
      { planet: 'Sun', sign: data.sunSign, house: getHouseOfSign(data.ascSignIndex, data.sunSignIndex), degree: '12° 41\'' },
      { planet: 'Moon', sign: data.moonSign, house: getHouseOfSign(data.ascSignIndex, data.moonSignIndex), degree: '24° 15\'' },
      { planet: 'Ascendant', sign: data.ascSign, house: 1, degree: '05° 12\'' },
      { planet: 'Mercury', sign: ZODIAC_SIGNS[(data.sunSignIndex + 1) % 12], house: getHouseOfSign(data.ascSignIndex, (data.sunSignIndex + 1) % 12), degree: '02° 30\'' },
      { planet: 'Venus', sign: ZODIAC_SIGNS[(data.sunSignIndex - 1 + 12) % 12], house: getHouseOfSign(data.ascSignIndex, (data.sunSignIndex - 1 + 12) % 12), degree: '18° 10\'' },
      { planet: 'Mars', sign: ZODIAC_SIGNS[(data.moonSignIndex + 2) % 12], house: getHouseOfSign(data.ascSignIndex, (data.moonSignIndex + 2) % 12), degree: '09° 52\'' },
      { planet: 'Jupiter', sign: ZODIAC_SIGNS[(data.ascSignIndex + 4) % 12], house: getHouseOfSign(data.ascSignIndex, (data.ascSignIndex + 4) % 12), degree: '22° 11\'' },
      { planet: 'Saturn', sign: ZODIAC_SIGNS[(data.ascSignIndex + 8) % 12], house: getHouseOfSign(data.ascSignIndex, (data.ascSignIndex + 8) % 12), degree: '14° 03\'' }
    ];

    placements.forEach((p) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${p.planet}</strong></td>
        <td>${p.sign.symbol} ${p.sign.name}</td>
        <td>House ${p.house}</td>
        <td>${p.degree}</td>
        <td>${p.sign.element}</td>
      `;
      tbody.appendChild(row);
    });
  }

  // Populate Astrology Readings
  function populateReadings(data) {
    const sunDetail = document.getElementById('sunSignReading');
    const ascDetail = document.getElementById('ascSignReading');
    const moonDetail = document.getElementById('moonSignReading');

    // Sun Sign Reading
    const sunReadings = {
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
    };

    // Ascendant (Rising) Reading
    const ascReadings = {
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
    };

    // Moon Sign Reading
    const moonReadings = {
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
    };

    sunDetail.innerText = sunReadings[data.sunSign.name];
    ascDetail.innerText = ascReadings[data.ascSign.name];
    moonDetail.innerText = moonReadings[data.moonSign.name];
  }
});
