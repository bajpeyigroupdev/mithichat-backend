import Level, { ILevel } from "../models/level.model";

export const createLevel = async (data: Partial<ILevel>) => {
  return await Level.create(data);
};

export const getLevels = async () => {
  return await Level.find().sort({ level: 1 });
};

export const getLevelById = async (id: string) => {
  return await Level.findById(id);
};

export const deleteLevel = async (id: string) => {
  return await Level.findByIdAndDelete(id);
};
