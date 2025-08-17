# テスト戦略 - IDO Editor

## 概要

IDO Editor のテスト戦略は Testing Trophy アプローチを採用し、統合テストを中心としつつ、各レベルで適切なテストカバレッジを確保します。

## Testing Trophy アプローチ

```
        🏆
       /|\
      / | \
     /  |  \
    /   |   \
   /    |    \
  /_____|_____\
  E2E   IT   UT
  
E2E (End-to-End): 10%
IT (Integration): 70%
UT (Unit): 20%
```

### 各テストレベルの役割

#### 1. 単体テスト (Unit Tests) - 20%
**対象**: 純粋関数、ユーティリティ関数
**ツール**: Jest + TypeScript

```typescript
// src/lib/__tests__/dataAnalysisUtils.test.ts
import { calculateStatistics, executeSQL } from '../dataAnalysisUtils';

describe('dataAnalysisUtils', () => {
  describe('calculateStatistics', () => {
    test('数値データの統計情報を正しく計算する', () => {
      const testData = [
        { age: 25, salary: 50000 },
        { age: 30, salary: 60000 },
        { age: 35, salary: 70000 }
      ];
      
      const stats = calculateStatistics(testData);
      
      expect(stats.age.mean).toBe(30);
      expect(stats.age.count).toBe(3);
      expect(stats.age.min).toBe(25);
      expect(stats.age.max).toBe(35);
    });

    test('空配列の場合は空のオブジェクトを返す', () => {
      const stats = calculateStatistics([]);
      expect(stats).toEqual({});
    });

    test('null値を含むデータを適切に処理する', () => {
      const testData = [
        { age: 25, salary: null },
        { age: null, salary: 60000 },
        { age: 35, salary: 70000 }
      ];
      
      const stats = calculateStatistics(testData);
      
      expect(stats.age.count).toBe(2); // null値は除外
      expect(stats.age.mean).toBe(30); // (25 + 35) / 2
    });
  });

  describe('executeSQL', () => {
    test('基本的なSELECT文を実行できる', async () => {
      const testData = [
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 30 }
      ];
      
      const result = await executeSQL(testData, 'SELECT * FROM ? WHERE age > 25');
      
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Bob');
    });

    test('不正なSQL文の場合はエラーを投げる', async () => {
      const testData = [{ name: 'Alice' }];
      
      await expect(executeSQL(testData, 'INVALID SQL'))
        .rejects
        .toThrow();
    });
  });
});
```

#### 2. 統合テスト (Integration Tests) - 70%
**対象**: コンポーネント間の連携、データフロー
**ツール**: React Testing Library + Jest

```typescript
// src/components/__tests__/DataAnalysis.integration.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DataAnalysis from '../analysis/DataAnalysis';

// モックデータ
const mockData = [
  { product: 'A', sales: 100, region: 'North' },
  { product: 'B', sales: 150, region: 'South' },
  { product: 'C', sales: 200, region: 'North' }
];

describe('DataAnalysis 統合テスト', () => {
  test('SQLクエリ実行→結果表示→グラフ作成の完全フロー', async () => {
    render(
      <DataAnalysis 
        data={mockData} 
        fileName="test.csv" 
        fileType="csv" 
      />
    );

    // 1. SQLタブが表示されている
    expect(screen.getByText('SQL')).toBeInTheDocument();

    // 2. SQLクエリを入力
    const sqlInput = screen.getByPlaceholderText('SELECT * FROM ?');
    await userEvent.type(sqlInput, 'SELECT product, SUM(sales) as total FROM ? GROUP BY product');

    // 3. クエリ実行ボタンをクリック
    const executeButton = screen.getByText('実行');
    fireEvent.click(executeButton);

    // 4. 結果テーブルが表示される
    await waitFor(() => {
      expect(screen.getByText('product')).toBeInTheDocument();
      expect(screen.getByText('total')).toBeInTheDocument();
    });

    // 5. グラフタブに切り替え
    const chartTab = screen.getByText('グラフ');
    fireEvent.click(chartTab);

    // 6. グラフ設定を行う
    const chartTypeSelect = screen.getByLabelText('グラフタイプ');
    await userEvent.selectOptions(chartTypeSelect, 'bar');

    const xAxisSelect = screen.getByLabelText('X軸');
    await userEvent.selectOptions(xAxisSelect, 'product');

    const yAxisSelect = screen.getByLabelText('Y軸');
    await userEvent.selectOptions(yAxisSelect, 'total');

    // 7. グラフが描画される
    await waitFor(() => {
      expect(screen.getByTestId('chart-container')).toBeInTheDocument();
    });
  });

  test('複数ファイル分析: UNION結合→クエリ実行フロー', async () => {
    const additionalData = [
      { product: 'D', sales: 120, region: 'East' }
    ];

    render(
      <DataAnalysis 
        data={mockData} 
        fileName="test1.csv" 
        fileType="csv"
        multiFileMode={true}
        additionalFiles={[
          { name: 'test2.csv', data: additionalData }
        ]}
      />
    );

    // 1. 複数ファイルタブに切り替え
    const multiFileTab = screen.getByText('複数ファイル');
    fireEvent.click(multiFileTab);

    // 2. UNION結合を選択
    const unionButton = screen.getByText('UNION');
    fireEvent.click(unionButton);

    // 3. 結合が完了し、統合データが表示される
    await waitFor(() => {
      expect(screen.getByText('4 rows')).toBeInTheDocument(); // 3 + 1 = 4行
    });

    // 4. 統合データに対してクエリを実行
    const sqlInput = screen.getByPlaceholderText('SELECT * FROM ?');
    await userEvent.clear(sqlInput);
    await userEvent.type(sqlInput, 'SELECT region, COUNT(*) as count FROM ? GROUP BY region');

    const executeButton = screen.getByText('実行');
    fireEvent.click(executeButton);

    // 5. 地域別集計結果が表示される
    await waitFor(() => {
      expect(screen.getByText('North')).toBeInTheDocument();
      expect(screen.getByText('South')).toBeInTheDocument();
      expect(screen.getByText('East')).toBeInTheDocument();
    });
  });

  test('エラーハンドリング: 不正なSQLクエリでエラーメッセージ表示', async () => {
    render(
      <DataAnalysis 
        data={mockData} 
        fileName="test.csv" 
        fileType="csv" 
      />
    );

    // 1. 不正なSQLを入力
    const sqlInput = screen.getByPlaceholderText('SELECT * FROM ?');
    await userEvent.type(sqlInput, 'INVALID SQL QUERY');

    // 2. 実行
    const executeButton = screen.getByText('実行');
    fireEvent.click(executeButton);

    // 3. エラーメッセージが表示される
    await waitFor(() => {
      expect(screen.getByText(/SQL実行エラー/)).toBeInTheDocument();
    });
  });
});
```

#### 3. E2Eテスト (End-to-End Tests) - 10%
**対象**: ユーザーワークフロー全体
**ツール**: Playwright

```typescript
// e2e/data-analysis-workflow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('データ分析ワークフロー E2E', () => {
  test('CSVファイル分析の完全ワークフロー', async ({ page }) => {
    await page.goto('/');

    // 1. フォルダを開く
    await page.click('[data-testid="open-folder-button"]');
    
    // File System Access API のモック
    await page.evaluate(() => {
      // @ts-ignore
      window.showDirectoryPicker = async () => {
        // モックディレクトリハンドルを返す
        return mockDirectoryHandle;
      };
    });

    // 2. CSVファイルを選択
    await page.click('[data-testid="file-item"][data-filename="sales.csv"]');

    // 3. ファイルが開かれ、プレビューが表示される
    await expect(page.locator('[data-testid="data-preview"]')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();

    // 4. 分析モードに切り替え
    await page.click('[data-testid="analysis-button"]');
    await expect(page.locator('[data-testid="analysis-panel"]')).toBeVisible();

    // 5. SQLクエリを実行
    await page.fill('[data-testid="sql-input"]', 'SELECT product, SUM(sales) FROM ? GROUP BY product');
    await page.click('[data-testid="execute-sql-button"]');

    // 6. 結果が表示される
    await expect(page.locator('[data-testid="query-result-table"]')).toBeVisible();

    // 7. グラフを作成
    await page.click('[data-testid="chart-tab"]');
    await page.selectOption('[data-testid="chart-type-select"]', 'bar');
    await page.selectOption('[data-testid="x-axis-select"]', 'product');
    await page.selectOption('[data-testid="y-axis-select"]', 'sales');

    // 8. グラフが描画される
    await expect(page.locator('[data-testid="chart-container"] canvas')).toBeVisible();

    // 9. グラフ設定の変更
    await page.selectOption('[data-testid="chart-type-select"]', 'pie');
    
    // 10. 円グラフに変更される
    await expect(page.locator('[data-testid="chart-container"] canvas')).toBeVisible();
  });

  test('複数ファイル分析ワークフロー', async ({ page }) => {
    await page.goto('/');

    // 1. 複数のCSVファイルを開く
    await page.click('[data-testid="open-folder-button"]');
    await page.click('[data-testid="file-item"][data-filename="sales_q1.csv"]');
    await page.click('[data-testid="file-item"][data-filename="sales_q2.csv"]');

    // 2. 複数ファイル分析モードに切り替え
    await page.click('[data-testid="multi-file-analysis-button"]');

    // 3. UNION結合を実行
    await page.click('[data-testid="union-button"]');
    await expect(page.locator('[data-testid="union-result"]')).toBeVisible();

    // 4. 統合データでクエリ実行
    await page.fill('[data-testid="sql-input"]', 'SELECT quarter, SUM(amount) FROM ? GROUP BY quarter');
    await page.click('[data-testid="execute-sql-button"]');

    // 5. 四半期別集計結果が表示される
    await expect(page.locator('[data-testid="query-result-table"]')).toContainText('Q1');
    await expect(page.locator('[data-testid="query-result-table"]')).toContainText('Q2');
  });

  test('エラー回復ワークフロー', async ({ page }) => {
    await page.goto('/');

    // 1. ファイルを開く
    await page.click('[data-testid="open-folder-button"]');
    await page.click('[data-testid="file-item"][data-filename="broken.csv"]');

    // 2. パースエラーが発生
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();

    // 3. エラーメッセージの確認
    await expect(page.locator('[data-testid="error-message"]')).toContainText('ファイルの解析に失敗');

    // 4. 別のファイルを開いて回復
    await page.click('[data-testid="file-item"][data-filename="valid.csv"]');
    await expect(page.locator('[data-testid="data-preview"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).not.toBeVisible();
  });
});
```

## テストデータ管理

### モックデータセット

```typescript
// src/test-utils/mockData.ts
export const mockSalesData = [
  { id: 1, product: 'Laptop', price: 1200, category: 'Electronics', date: '2024-01-15' },
  { id: 2, product: 'Mouse', price: 25, category: 'Electronics', date: '2024-01-16' },
  { id: 3, product: 'Keyboard', price: 75, category: 'Electronics', date: '2024-01-17' },
  { id: 4, product: 'Monitor', price: 300, category: 'Electronics', date: '2024-01-18' },
  { id: 5, product: 'Chair', price: 150, category: 'Furniture', date: '2024-01-19' }
];

export const mockCustomerData = [
  { id: 1, name: 'Alice Johnson', age: 28, city: 'New York', segment: 'Premium' },
  { id: 2, name: 'Bob Smith', age: 34, city: 'Los Angeles', segment: 'Standard' },
  { id: 3, name: 'Carol Brown', age: 42, city: 'Chicago', segment: 'Premium' },
  { id: 4, name: 'David Wilson', age: 29, city: 'Houston', segment: 'Basic' },
  { id: 5, name: 'Eva Davis', age: 36, city: 'Phoenix', segment: 'Standard' }
];

export const mockTimeSeriesData = Array.from({ length: 100 }, (_, i) => ({
  date: new Date(2024, 0, i + 1).toISOString().split('T')[0],
  value: Math.sin(i * 0.1) * 50 + 100 + Math.random() * 20
}));
```

### テストユーティリティ

```typescript
// src/test-utils/testHelpers.ts
import { render, RenderOptions } from '@testing-library/react';
import { ReactElement } from 'react';

// カスタムレンダー（ストアプロバイダー付き）
export const renderWithStore = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    return (
      <TestStoreProvider>
        {children}
      </TestStoreProvider>
    );
  };

  return render(ui, { wrapper: Wrapper, ...options });
};

// ファイルハンドルのモック作成
export const createMockFileHandle = (content: string, name: string): FileSystemFileHandle => {
  const file = new File([content], name, { type: 'text/plain' });
  
  return {
    getFile: jest.fn().mockResolvedValue(file),
    createWritable: jest.fn(),
    name,
    kind: 'file'
  } as any;
};

// 分析データの期待値検証ヘルパー
export const expectValidStatistics = (stats: any) => {
  expect(stats).toBeDefined();
  expect(typeof stats.count).toBe('number');
  expect(stats.count).toBeGreaterThan(0);
  
  if (stats.mean !== undefined) {
    expect(typeof stats.mean).toBe('number');
    expect(stats.mean).toBeGreaterThanOrEqual(stats.min);
    expect(stats.mean).toBeLessThanOrEqual(stats.max);
  }
};
```

## パフォーマンステスト

### 大容量データテスト

```typescript
// src/performance/__tests__/largeDataset.test.ts
describe('大容量データセット処理', () => {
  test('10万行のCSVデータを5秒以内で処理できる', async () => {
    const largeDataset = Array.from({ length: 100000 }, (_, i) => ({
      id: i,
      value: Math.random() * 1000,
      category: `Category ${i % 10}`
    }));

    const startTime = performance.now();
    
    const stats = calculateStatistics(largeDataset);
    const queryResult = await executeSQL(largeDataset, 'SELECT category, COUNT(*) FROM ? GROUP BY category');
    
    const endTime = performance.now();
    const processingTime = endTime - startTime;

    expect(processingTime).toBeLessThan(5000); // 5秒以内
    expect(stats).toBeDefined();
    expect(queryResult).toHaveLength(10); // 10カテゴリ
  });

  test('メモリ使用量が500MB以下に抑えられる', async () => {
    const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
    
    const largeDataset = Array.from({ length: 50000 }, (_, i) => ({
      id: i,
      data: 'x'.repeat(100) // 100文字の文字列
    }));

    await executeSQL(largeDataset, 'SELECT COUNT(*) FROM ?');
    
    const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
    const memoryIncrease = finalMemory - initialMemory;
    
    // 500MB = 500 * 1024 * 1024 bytes
    expect(memoryIncrease).toBeLessThan(500 * 1024 * 1024);
  });
});
```

## テスト自動化

### GitHub Actions 設定

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run unit tests
      run: npm run test:unit
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3

  integration-tests:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run integration tests
      run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Install Playwright
      run: npx playwright install
    
    - name: Build application
      run: npm run build
    
    - name: Start server
      run: npm start &
    
    - name: Wait for server
      run: npx wait-on http://localhost:3000
    
    - name: Run E2E tests
      run: npm run test:e2e
    
    - name: Upload test artifacts
      uses: actions/upload-artifact@v3
      if: failure()
      with:
        name: playwright-report
        path: playwright-report/
```

## テスト環境セットアップ

### Jest 設定

```javascript
// jest.config.js
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testEnvironment: 'jsdom',
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
    '<rootDir>/src/**/*.{test,spec}.{js,jsx,ts,tsx}',
  ],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['next/babel'] }],
  },
};

module.exports = createJestConfig(customJestConfig);
```

### Playwright 設定

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

## 継続的品質向上

### テストメトリクス

- **カバレッジ目標**: 70%以上
- **実行時間**: 単体テスト 30秒以内、統合テスト 5分以内、E2E 15分以内
- **フレークテスト**: 1%以下
- **メンテナンス頻度**: 機能追加時の同時更新

### 品質ゲート

1. **プルリクエスト**: 全テスト通過必須
2. **カバレッジ**: 新機能は80%以上
3. **パフォーマンス**: 既存機能の性能劣化なし
4. **E2E**: 主要ユーザーフロー100%動作

この包括的なテスト戦略により、IDO Editor の品質と信頼性を継続的に向上させ、新機能追加時の回帰バグを防止します。