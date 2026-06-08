export function bottlesAndMlToTotalMl(
  bottles: number,
  mlPerBottle: number,
  extraMl: number
): number {
  if (mlPerBottle <= 0) return 0;
  return bottles * mlPerBottle + extraMl;
}

export interface BottlesAndMl {
  bottles: number;
  remainingMl: number;
}

export function totalMlToBottlesAndMl(
  totalMl: number,
  mlPerBottle: number
): BottlesAndMl {
  if (mlPerBottle <= 0) {
    return { bottles: 0, remainingMl: 0 };
  }
  const bottles = Math.floor(totalMl / mlPerBottle);
  const remainingMl = Math.round(totalMl % mlPerBottle);
  return { bottles, remainingMl };
}

export function totalMlToFractionalBottles(
  totalMl: number,
  mlPerBottle: number
): number {
  if (mlPerBottle <= 0) return 0;
  return Number((totalMl / mlPerBottle).toFixed(4));
}

export function formatPresentationStock(
  totalMl: number,
  mlPerBottle: number
): string {
  if (mlPerBottle <= 0 || totalMl <= 0) {
    return "0 bot.";
  }
  const { bottles, remainingMl } = totalMlToBottlesAndMl(totalMl, mlPerBottle);
  if (bottles === 0) {
    return `${remainingMl} ml`;
  }
  if (remainingMl === 0) {
    return `${bottles} bot.`;
  }
  return `${bottles} bot. y ${remainingMl} ml`;
}

export function calculateCostPerMl(
  bottleCost: number,
  mlPerBottle: number
): number {
  if (mlPerBottle <= 0) return 0;
  return Number((bottleCost / mlPerBottle).toFixed(4));
}

export function calculateStockValue(
  totalMl: number,
  mlPerBottle: number,
  bottleCost: number
): number {
  if (mlPerBottle <= 0) return 0;
  const costPerMl = bottleCost / mlPerBottle;
  return Number((totalMl * costPerMl).toFixed(2));
}
