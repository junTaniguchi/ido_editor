declare module 'jstat' {
  export const jStat: {
    mean: (data: number[]) => number;
    stdev: (data: number[]) => number;
    median: (data: number[]) => number;
    quartiles: (data: number[]) => [number, number, number];
    min: (data: number[]) => number;
    max: (data: number[]) => number;
  };
}
