import mongoose, { Schema, Document } from 'mongoose';

export interface IPageRegistry extends Document {
  pageId: string;
  name: string;
  category: string;
  icon?: string;
  actions: string[];
  fields: { key: string; label: string }[];
  columns: { key: string; label: string }[];
  buttons: { key: string; label: string }[];
  tabs: { key: string; label: string }[];
  cards: { key: string; label: string }[];
  widgets: { key: string; label: string }[];
  filters: { key: string; label: string }[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const pageRegistrySchema = new Schema<IPageRegistry>(
  {
    pageId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    category: { type: String, default: 'General' },
    icon: { type: String },
    actions: { type: [String], default: [] },
    fields: [{ key: String, label: String }],
    columns: [{ key: String, label: String }],
    buttons: [{ key: String, label: String }],
    tabs: [{ key: String, label: String }],
    cards: [{ key: String, label: String }],
    widgets: [{ key: String, label: String }],
    filters: [{ key: String, label: String }],
    metadata: { type: Schema.Types.Map, of: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const PageRegistry = mongoose.model<IPageRegistry>('PageRegistry', pageRegistrySchema);
