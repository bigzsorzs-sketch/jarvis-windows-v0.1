export function getGreeting(name, lang = 'hu') {
  const h = new Date().getHours();
  const greetings = {
    hu: h < 5 ? '🌙 Jó éjszakát' : h < 10 ? '🌅 Jó reggelt' : h < 14 ? '☀️ Jó napot' : h < 18 ? '🌤️ Jó délutánt' : '🌆 Jó estét',
    en: h < 5 ? '🌙 Good night' : h < 10 ? '🌅 Good morning' : h < 14 ? '☀️ Good afternoon' : h < 18 ? '🌤️ Good afternoon' : '🌆 Good evening',
  };
  const helpTexts = {
    hu: 'Miben segíthetek?',
    en: 'How can I help?',
  };
  const salut = greetings[lang] || greetings.en;
  const help = helpTexts[lang] || helpTexts.en;
  return name ? `${salut}, ${name}! ${help}` : `${salut}! ${help}`;
}