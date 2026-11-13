import type { Answer, Sources } from './app.contract.d.ts';

export const grants = '';

// The form keeps its values in Contract state; there is no data source yet.
const sources: Sources = {};
export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
