/** Record the pronouns an inmate stated in a letter. */
export interface PronounsSet {
  pronouns: string;
  /** The recording volunteer's initials. */
  set_by: string;
}

/** Clear an inmate's recorded pronouns; initials are required to clear too. */
export interface PronounsClear {
  set_by: string;
}

/** An inmate's recorded pronouns, who recorded them and when. */
export interface InmatePronouns {
  pronouns: string;
  set_by: string;
  set_at: string;
}
