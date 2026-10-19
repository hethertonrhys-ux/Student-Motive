// Choosing photos and cropping them to the shape they're shown in. Metro
// picks pick-photos.web.tsx (a file chooser and an on-page cropper) or
// pick-photos.native.ts (the phone's photo library and its own cropper).
export type Picked = { bytes: ArrayBuffer; type: string; original?: { bytes: ArrayBuffer; type: string } };
export type PickOptions = { count: number; aspect: number; shape?: "rect" | "circle"; output?: number; keepOriginal?: boolean };
export declare function pickPhotos(options: PickOptions): Promise<Picked[]>;
// Re-crop a photo that's already uploaded. Only the web can (the phone has no cropper of its own for this).
export declare function cropExisting(url: string, options: { aspect: number; shape?: "rect" | "circle"; output?: number }): Promise<Picked | null>;
export declare const CAN_RECROP: boolean;
