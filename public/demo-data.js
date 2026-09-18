export const flights = [
  { id: 'AI806', airline: 'Air India', code: 'AI', departure: '18:15', arrival: '20:45', price: 8200, stops: 0, available: false },
  { id: '6E204', airline: 'IndiGo', code: '6E', departure: '18:40', arrival: '21:25', price: 12840, stops: 0, available: true },
  { id: 'QP142', airline: 'Akasa Air', code: 'QP', departure: '17:10', arrival: '21:50', price: 10900, stops: 1, available: true },
  { id: 'AI502', airline: 'Air India', code: 'AI', departure: '20:00', arrival: '22:45', price: 9600, stops: 0, available: true },
];
export const services = { dental: 'Dental check-up', haircut: 'Hair appointment', consultation: 'Design consultation' };
export const categories = { Food: 'Meals, groceries, and food delivery', Travel: 'Transport, flights, hotels, and commuting', Entertainment: 'Leisure, music, movies, and streaming', Income: 'Salary, incoming earnings, and interest', Software: 'Software subscriptions and cloud services', Other: 'Anything outside the other categories or ambiguous' };
export const transactions = [
  ['Uber India', -620], ['Netflix', -649], ['Salary credit', 85000], ['Swiggy', -430],
  ['AWS', -2450], ['IRCTC', -1840], ['Zomato', -780], ['Spotify', -119],
].map(([description, amount], i) => ({ id: `tx${i}`, description, amount }));
export function slotsFor(date, service) {
  return ['09:00', '10:30', '12:00', '14:00', '15:30', '17:00'].map((time, i) => ({
    id: `slot${i}`, date, time, service, duration: service === 'consultation' ? 60 : 30,
    available: (Number(date.slice(-2)) + i) % 4 !== 0,
    provider: service === 'dental' ? 'Dr. Meera Shah' : service === 'haircut' ? 'Alex · Studio 12' : 'Jamie · Form Studio',
  }));
}
