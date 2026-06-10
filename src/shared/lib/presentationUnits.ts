export function parentAndFractionsToTotal(
  parentUnits: number,
  fractionsPerParent: number,
  extraFractions: number
): number {
  if (fractionsPerParent <= 0) return 0;
  return parentUnits * fractionsPerParent + extraFractions;
}

export interface ParentAndFractions {
  parentUnits: number;
  remainingFractions: number;
}

export function totalToParentAndFractions(
  totalFractions: number,
  fractionsPerParent: number
): ParentAndFractions {
  if (fractionsPerParent <= 0) {
    return { parentUnits: 0, remainingFractions: 0 };
  }
  const parentUnits = Math.floor(totalFractions / fractionsPerParent);
  const remainingFractions = Math.round(totalFractions % fractionsPerParent);
  return { parentUnits, remainingFractions };
}

export function totalToFractionalParents(
  totalFractions: number,
  fractionsPerParent: number
): number {
  if (fractionsPerParent <= 0) return 0;
  return Number((totalFractions / fractionsPerParent).toFixed(4));
}

export function formatFractionalStock(
  totalFractions: number,
  fractionsPerParent: number,
  parentUnitName: string = "unidades",
  fractionUnitName: string = "fracciones"
): string {
  if (fractionsPerParent <= 0 || totalFractions <= 0) {
    return `0 ${parentUnitName}`;
  }
  const { parentUnits, remainingFractions } = totalToParentAndFractions(totalFractions, fractionsPerParent);
  if (parentUnits === 0) {
    return `${remainingFractions} ${fractionUnitName}`;
  }
  if (remainingFractions === 0) {
    return `${parentUnits} ${parentUnitName}`;
  }
  return `${parentUnits} ${parentUnitName} y ${remainingFractions} ${fractionUnitName}`;
}

export function calculateCostPerFraction(
  parentUnitCost: number,
  fractionsPerParent: number
): number {
  if (fractionsPerParent <= 0) return 0;
  return Number((parentUnitCost / fractionsPerParent).toFixed(4));
}

export function calculateStockValue(
  totalFractions: number,
  fractionsPerParent: number,
  parentUnitCost: number
): number {
  if (fractionsPerParent <= 0) return 0;
  const costPerFraction = parentUnitCost / fractionsPerParent;
  return Number((totalFractions * costPerFraction).toFixed(2));
}
