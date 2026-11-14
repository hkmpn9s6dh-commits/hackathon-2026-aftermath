/** The shape of one fetched cascade, and of the rows that go into the graph. */

export interface CascadeWork {
  id: string;
  doi: string;
  title: string;
  year: number | null;
  citations: number;
  type: string;
  journal: string;
  authors: string[];
  citesNotice: boolean;
}

export interface Cascade {
  slug: string;
  fetched: string;
  source: string;
  field: string;
  story: string;
  seed: CascadeWork;
  notice: CascadeWork;
  totalCiters: number;
  sampled: number;
  sampling: string;
  works: CascadeWork[];
  edges: Array<[string, string]>;
}

export interface Work {
  id: string;
  title: string;
  year: number | null;
  citations: number;
  journal: string;
  doi: string;
  authors: string;
  role: 'seed' | 'notice' | '';
  /** does this paper cite the retraction notice? */
  citesNotice: boolean;
  /** cites the paper, does not cite the retraction, and was published after it */
  silent: boolean;
  /** published before the retraction existed — silence is not a lapse */
  predates: boolean;
}

export interface SeedSummary {
  slug: string;
  field: string;
  story: string;
  title: string;
  year: number | null;
  noticeYear: number | null;
  totalCiters: number;
  sampled: number;
  after: number;
  silent: number;
  acknowledged: number;
}
