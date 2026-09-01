function getPhoneDigits(phone: string) {
  return phone.replace(/\D/g, "").replace(/^00/, "");
}

export function isValidFullName(fullName: string) {
  return fullName.trim().split(/\s+/).filter(Boolean).length >= 2;
}

function getArgentinaNationalNumber(phone: string) {
  const digits = getPhoneDigits(phone);
  const withoutCountryCode = digits.startsWith("54")
    ? digits.slice(2)
    : digits;
  const withoutTrunkPrefix = withoutCountryCode.replace(/^0/, "");

  const legacyMobileMatch = withoutCountryCode.match(
    /^0(\d{2,4})15(\d{6,8})$/
  );
  if (
    legacyMobileMatch &&
    `${legacyMobileMatch[1]}${legacyMobileMatch[2]}`.length === 10
  ) {
    return `${legacyMobileMatch[1]}${legacyMobileMatch[2]}`;
  }

  return withoutTrunkPrefix.startsWith("9") &&
    withoutTrunkPrefix.length === 11
    ? withoutTrunkPrefix.slice(1)
    : withoutTrunkPrefix;
}

export function isValidArgentinaContactPhone(phone: string) {
  return getArgentinaNationalNumber(phone).length === 10;
}

export function normalizeArgentinaWhatsAppPhone(phone: string) {
  if (!isValidArgentinaContactPhone(phone)) return "";

  return `549${getArgentinaNationalNumber(phone)}`;
}
