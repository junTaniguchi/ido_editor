const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// テストデータ用のExcelファイルを作成する関数
function createTestExcelFiles() {
  const testDataDir = path.join(__dirname, '../test_data');
  
  // 1. 売上データ（複数シート）
  const salesData = [
    { 日付: '2024-01-01', 商品名: 'ノートPC', カテゴリ: '電子機器', 売上金額: 98000, 数量: 2, 営業担当: '田中' },
    { 日付: '2024-01-02', 商品名: 'マウス', カテゴリ: '周辺機器', 売上金額: 2500, 数量: 5, 営業担当: '佐藤' },
    { 日付: '2024-01-03', 商品名: 'キーボード', カテゴリ: '周辺機器', 売上金額: 8000, 数量: 4, 営業担当: '田中' },
    { 日付: '2024-01-04', 商品名: 'モニター', カテゴリ: '電子機器', 売上金額: 45000, 数量: 3, 営業担当: '鈴木' },
    { 日付: '2024-01-05', 商品名: 'プリンター', カテゴリ: '事務機器', 売上金額: 25000, 数量: 1, 営業担当: '佐藤' },
    { 日付: '2024-01-06', 商品名: 'タブレット', カテゴリ: '電子機器', 売上金額: 35000, 数量: 2, 営業担当: '高橋' },
    { 日付: '2024-01-07', 商品名: 'スピーカー', カテゴリ: '周辺機器', 売上金額: 12000, 数量: 3, 営業担当: '田中' },
    { 日付: '2024-01-08', 商品名: 'ヘッドセット', カテゴリ: '周辺機器', 売上金額: 7500, 数量: 5, 営業担当: '鈴木' },
    { 日付: '2024-01-09', 商品名: 'ノートPC', カテゴリ: '電子機器', 売上金額: 120000, 数量: 3, 営業担当: '高橋' },
    { 日付: '2024-01-10', 商品名: 'SSD', カテゴリ: 'ストレージ', 売上金額: 15000, 数量: 6, 営業担当: '佐藤' }
  ];

  const employeeData = [
    { 社員ID: 'E001', 氏名: '田中太郎', 部署: '営業部', 年齢: 32, 入社年: 2018, 給与: 450000 },
    { 社員ID: 'E002', 氏名: '佐藤花子', 部署: '営業部', 年齢: 28, 入社年: 2020, 給与: 380000 },
    { 社員ID: 'E003', 氏名: '鈴木一郎', 部署: '開発部', 年齢: 35, 入社年: 2015, 給与: 520000 },
    { 社員ID: 'E004', 氏名: '高橋美咲', 部署: '営業部', 年齢: 26, 入社年: 2022, 給与: 350000 },
    { 社員ID: 'E005', 氏名: '中村健', 部署: '開発部', 年齢: 40, 入社年: 2010, 給与: 600000 }
  ];

  const productData = [
    { 商品ID: 'P001', 商品名: 'ノートPC', カテゴリ: '電子機器', 価格: 98000, 在庫数: 25, 仕入先: 'A商事' },
    { 商品ID: 'P002', 商品名: 'マウス', カテゴリ: '周辺機器', 価格: 2500, 在庫数: 150, 仕入先: 'B商事' },
    { 商品ID: 'P003', 商品名: 'キーボード', カテゴリ: '周辺機器', 価格: 8000, 在庫数: 80, 仕入先: 'B商事' },
    { 商品ID: 'P004', 商品名: 'モニター', カテゴリ: '電子機器', 価格: 45000, 在庫数: 30, 仕入先: 'C商事' },
    { 商品ID: 'P005', 商品名: 'プリンター', カテゴリ: '事務機器', 価格: 25000, 在庫数: 15, 仕入先: 'D商事' }
  ];

  // 1. 売上データ（複数シート）のExcelファイル
  const salesWorkbook = XLSX.utils.book_new();
  const salesWorksheet = XLSX.utils.json_to_sheet(salesData);
  const employeeWorksheet = XLSX.utils.json_to_sheet(employeeData);
  const productWorksheet = XLSX.utils.json_to_sheet(productData);
  
  XLSX.utils.book_append_sheet(salesWorkbook, salesWorksheet, '売上データ');
  XLSX.utils.book_append_sheet(salesWorkbook, employeeWorksheet, '社員データ');
  XLSX.utils.book_append_sheet(salesWorkbook, productWorksheet, '商品データ');
  
  XLSX.writeFile(salesWorkbook, path.join(testDataDir, 'sales_data.xlsx'));

  // 2. Irisデータセット（分析用）
  const irisData = [
    { sepal_length: 5.1, sepal_width: 3.5, petal_length: 1.4, petal_width: 0.2, species: 'setosa' },
    { sepal_length: 4.9, sepal_width: 3.0, petal_length: 1.4, petal_width: 0.2, species: 'setosa' },
    { sepal_length: 4.7, sepal_width: 3.2, petal_length: 1.3, petal_width: 0.2, species: 'setosa' },
    { sepal_length: 4.6, sepal_width: 3.1, petal_length: 1.5, petal_width: 0.2, species: 'setosa' },
    { sepal_length: 5.0, sepal_width: 3.6, petal_length: 1.4, petal_width: 0.2, species: 'setosa' },
    { sepal_length: 7.0, sepal_width: 3.2, petal_length: 4.7, petal_width: 1.4, species: 'versicolor' },
    { sepal_length: 6.4, sepal_width: 3.2, petal_length: 4.5, petal_width: 1.5, species: 'versicolor' },
    { sepal_length: 6.9, sepal_width: 3.1, petal_length: 4.9, petal_width: 1.5, species: 'versicolor' },
    { sepal_length: 5.5, sepal_width: 2.3, petal_length: 4.0, petal_width: 1.3, species: 'versicolor' },
    { sepal_length: 6.5, sepal_width: 2.8, petal_length: 4.6, petal_width: 1.5, species: 'versicolor' },
    { sepal_length: 6.3, sepal_width: 3.3, petal_length: 6.0, petal_width: 2.5, species: 'virginica' },
    { sepal_length: 5.8, sepal_width: 2.7, petal_length: 5.1, petal_width: 1.9, species: 'virginica' },
    { sepal_length: 7.1, sepal_width: 3.0, petal_length: 5.9, petal_width: 2.1, species: 'virginica' },
    { sepal_length: 6.3, sepal_width: 2.9, petal_length: 5.6, petal_width: 1.8, species: 'virginica' },
    { sepal_length: 6.5, sepal_width: 3.0, petal_length: 5.8, petal_width: 2.2, species: 'virginica' }
  ];

  const irisWorkbook = XLSX.utils.book_new();
  const irisWorksheet = XLSX.utils.json_to_sheet(irisData);
  XLSX.utils.book_append_sheet(irisWorkbook, irisWorksheet, 'Iris');
  XLSX.writeFile(irisWorkbook, path.join(testDataDir, 'iris.xlsx'));

  // 3. 日本の都市データ（地理分析用）
  const cityData = [
    { 都市名: '東京', 都道府県: '東京都', 人口: 13929286, 面積: 2194.07, 緯度: 35.6762, 経度: 139.6503, 地方: '関東' },
    { 都市名: '横浜', 都道府県: '神奈川県', 人口: 3724844, 面積: 437.38, 緯度: 35.4478, 経度: 139.6425, 地方: '関東' },
    { 都市名: '大阪', 都道府県: '大阪府', 人口: 2691185, 面積: 225.21, 緯度: 34.6937, 経度: 135.5023, 地方: '関西' },
    { 都市名: '名古屋', 都道府県: '愛知県', 人口: 2295638, 面積: 326.45, 緯度: 35.1815, 経度: 136.9066, 地方: '中部' },
    { 都市名: '札幌', 都道府県: '北海道', 人口: 1952356, 面積: 1121.26, 緯度: 43.0642, 経度: 141.3469, 地方: '北海道' },
    { 都市名: '福岡', 都道府県: '福岡県', 人口: 1581527, 面積: 343.39, 緯度: 33.5904, 経度: 130.4017, 地方: '九州' },
    { 都市名: '神戸', 都道府県: '兵庫県', 人口: 1518870, 面積: 557.02, 緯度: 34.6901, 経度: 135.1956, 地方: '関西' },
    { 都市名: '京都', 都道府県: '京都府', 人口: 1475183, 面積: 827.83, 緯度: 35.0116, 経度: 135.7681, 地方: '関西' },
    { 都市名: '川崎', 都道府県: '神奈川県', 人口: 1475213, 面積: 142.70, 緯度: 35.5308, 経度: 139.7029, 地方: '関東' },
    { 都市名: 'さいたま', 都道府県: '埼玉県', 人口: 1324854, 面積: 217.43, 緯度: 35.8617, 経度: 139.6455, 地方: '関東' }
  ];

  const cityWorkbook = XLSX.utils.book_new();
  const cityWorksheet = XLSX.utils.json_to_sheet(cityData);
  XLSX.utils.book_append_sheet(cityWorkbook, cityWorksheet, '都市データ');
  XLSX.writeFile(cityWorkbook, path.join(testDataDir, 'japan_cities.xlsx'));

  console.log('テスト用Excelファイルを作成しました:');
  console.log('- sales_data.xlsx (売上データ、社員データ、商品データの3シート)');
  console.log('- iris.xlsx (Irisデータセット)');
  console.log('- japan_cities.xlsx (日本の都市データ)');
}

// メイン実行
if (require.main === module) {
  createTestExcelFiles();
}

module.exports = { createTestExcelFiles };