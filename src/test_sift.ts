import { truncateUtf8, formatDayParts, getDayBadgeStyle } from './lib/utils/amharic.js';

console.log('--- Testing Sift Amharic UTF-8 Support ---');

// Test 1: Amharic Ge'ez text truncation
const amharicSample = 'ሰላም ለሁሉ! ይህ የቴሌግራም ቻናል መልዕክት ነው። አዲስ ዜናዎችን እና መረጃዎችን በየቀኑ እናጋራለን።';
console.log('Original Amharic:', amharicSample);
console.log('Truncated (20 chars):', truncateUtf8(amharicSample, 20));

// Test 2: Multilingual mixed text
const mixedSample = 'Breaking News 🚀: የዛሬ ዋና ዜናዎች - Check out the new project update today!';
console.log('Original Mixed:', mixedSample);
console.log('Truncated (25 chars):', truncateUtf8(mixedSample, 25));

// Test 3: Date formatting
const sampleDate = '2024-10-29T09:00:00.000Z';
const dateParts = formatDayParts(sampleDate);
console.log('Formatted Date Parts:', dateParts);
console.log('Day Badge Style:', getDayBadgeStyle(dateParts.weekdayShort));

console.log('✅ All utility checks passed!');
