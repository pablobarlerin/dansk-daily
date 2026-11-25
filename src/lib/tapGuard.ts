/** A second tap this soon after an accepted one is the tail of a double tap. */
export const DOUBLE_TAP_MS = 300

/** The clock tap guards read (wall time). Tests step it to tell taps apart. */
export const tapClock = { now: (): number => Date.now() }
