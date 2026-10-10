// Qualification only: a custom domain does not prove employment or ownership.
const personalDomains = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in',
  'ymail.com', 'rocketmail.com', 'hotmail.com', 'hotmail.co.uk', 'hotmail.fr',
  'outlook.com', 'outlook.co.uk', 'live.com', 'live.co.uk', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'aim.com', 'mail.com',
  'email.com', 'gmx.com', 'gmx.net', 'gmx.de', 'proton.me', 'protonmail.com',
  'pm.me', 'tuta.com', 'tutanota.com', 'yandex.com', 'yandex.ru', 'zoho.com',
  'qq.com', '163.com', '126.com', 'rediffmail.com', 'fastmail.com',
  'hey.com', 'mailinator.com', 'guerrillamail.com', 'tempmail.com',
]);

export function businessEmailError(value) {
  if (typeof value !== 'string') return 'Please enter a valid business email.';
  const email = value.trim();
  if (email.length > 254 || !/^[^\s@]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(email)) {
    return 'Please enter a valid business email.';
  }
  const domain = email.split('@')[1].toLowerCase();
  if (personalDomains.has(domain) || /^(?:yahoo|hotmail|outlook|live)\.(?:com|co)\.[a-z]{2}$/.test(domain)) {
    return 'Please enter your business email to continue.';
  }
  return '';
}
