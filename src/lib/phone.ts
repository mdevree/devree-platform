/**
 * Telefoonnummer normalisatie - hergebruikt logica uit n8n workflow
 * Genereert 3 formaten voor Mautic zoekacties
 */

export interface PhoneFormats {
  clean: string;      // 0612345678
  plus31: string;     // +31612345678
  withDash: string;   // 06-12345678
}

export function normalizePhoneNumber(rawNumber: string): PhoneFormats {
  let formatClean: string;
  let formatPlus31: string;
  let formatWithDash: string;

  if (rawNumber.startsWith("+31")) {
    formatPlus31 = rawNumber;
    formatClean = "0" + rawNumber.substring(3).replace(/[^\d]/g, "");
  } else if (rawNumber.startsWith("0")) {
    formatClean = rawNumber.replace(/[^\d]/g, "");
    formatPlus31 = "+31" + formatClean.substring(1);
  } else {
    formatClean = rawNumber.replace(/[^\d]/g, "");
    formatPlus31 = rawNumber;
  }

  // Format met streepje bepalen
  if (formatClean.startsWith("06") && formatClean.length === 10) {
    // Mobiel nummer
    formatWithDash = formatClean.substring(0, 2) + "-" + formatClean.substring(2);
  } else if (/^0[1-9]0/.test(formatClean)) {
    // 3-cijferig netnummer: 010, 020, 030
    formatWithDash = formatClean.substring(0, 3) + "-" + formatClean.substring(3);
  } else if (/^0[1-9][0-9]{2}/.test(formatClean) && formatClean.length === 10) {
    // 4-cijferig netnummer: 0181, 0182
    formatWithDash = formatClean.substring(0, 4) + "-" + formatClean.substring(4);
  } else {
    formatWithDash = formatClean;
  }

  return {
    clean: formatClean,
    plus31: formatPlus31,
    withDash: formatWithDash,
  };
}

/**
 * Bepaal het relevante telefoonnummer op basis van belrichting
 */
export function getContactNumber(
  direction: string,
  callerNumber: string,
  destinationNumber: string
): string {
  return direction === "outbound" ? destinationNumber : callerNumber;
}

/**
 * Bereken punten op basis van richting en reden (zelfde logica als n8n)
 * Inbound beantwoord: 5, Inbound gemist: 1
 * Outbound beantwoord: 2, Outbound gemist: 0
 */
export function calculateCallPoints(direction: string, reason: string | null): number {
  const isAnswered = reason === "completed" || reason === "answered";

  if (isAnswered) {
    return direction === "inbound" ? 5 : 2;
  }
  return direction === "inbound" ? 1 : 0;
}

/**
 * Geeft een Nederlandse beschrijving van het gesprek
 */
export function getCallTypeText(direction: string, reason: string | null): string {
  const isAnswered = reason === "completed" || reason === "answered";

  if (isAnswered) {
    return direction === "inbound"
      ? "Inkomend gesprek (beantwoord)"
      : "Uitgaand gesprek (beantwoord)";
  }
  return direction === "inbound"
    ? "Gemist inkomend gesprek"
    : "Uitgaand gesprek (niet opgenomen)";
}
