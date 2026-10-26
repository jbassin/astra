// The /chronicle data shapes. scripts/build-content.ts emits src/generated/chronicle.ts typed
// against these; they live in a committed module so lint and typecheck resolve them on a
// checkout that has not generated content (CI's lint job).

export interface ChronicleEpisode {
  date: string;
  episodeNumber: number;
  title: string;
  synopsis: string;
  keyBeats: string[];
  charactersPresent: string[];
  locations: string[];
  factions: string[];
  items: string[];
  cliffhanger: string;
  href: string | null;
}

export interface ChronicleSeason {
  number: number;
  title: string;
  arcSummary: string;
  episodes: ChronicleEpisode[];
}

export interface ChronicleShow {
  show: string;
  name: string;
  isMain: boolean;
  seasonCount: number;
  episodeCount: number;
  seasons: ChronicleSeason[];
}
