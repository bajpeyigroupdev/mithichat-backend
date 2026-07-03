import Avatar, { IAvatar } from "../models/avtar.model";

export const createAvatar = async (data: Partial<IAvatar>) => {
    return await Avatar.create(data);
};

export const getAvatars = async (gender ?: string) => {
    return await Avatar.find({gender : gender});
};

export const getAvatarById = async (id: string) => {
    return await Avatar.findById(id);
};

export const deleteAvatar = async (id: string) => {
    return await Avatar.findByIdAndDelete(id);
};
