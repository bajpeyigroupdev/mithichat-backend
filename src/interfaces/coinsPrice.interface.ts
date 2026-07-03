export interface IPricePlan {
  description: string;
  actualPrice: number;
  discountedPrice?: number;
  coins: number;
  type: "offline" | "online" ;
}