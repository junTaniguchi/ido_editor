const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// より高度な分析用のExcelファイルを作成
function createAdvancedExcelFiles() {
  const testDataDir = path.join(__dirname, '../test_data');
  
  // 時系列売上データ（月次データ）
  const timeSeriesData = [];
  const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  const products = ['ノートPC', 'タブレット', 'スマートフォン', 'モニター', 'キーボード'];
  const regions = ['東京', '大阪', '名古屋', '福岡', '札幌'];
  
  for (let year = 2022; year <= 2024; year++) {
    for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
      for (const product of products) {
        for (const region of regions) {
          const baseAmount = Math.floor(Math.random() * 500000) + 100000;
          const seasonality = monthIndex >= 5 && monthIndex <= 7 ? 1.3 : 1.0; // 夏季ボーナス
          const yearGrowth = year === 2022 ? 1.0 : year === 2023 ? 1.1 : 1.2; // 年次成長
          
          timeSeriesData.push({
            年: year,
            月: months[monthIndex],
            商品: product,
            地域: region,
            売上金額: Math.floor(baseAmount * seasonality * yearGrowth),
            販売数量: Math.floor((baseAmount * seasonality * yearGrowth) / (Math.random() * 50000 + 10000)),
            顧客数: Math.floor(Math.random() * 100) + 20
          });
        }
      }
    }
  }
  
  // 顧客分析データ
  const customerData = [];
  const ageGroups = ['20代', '30代', '40代', '50代', '60代以上'];
  const genders = ['男性', '女性'];
  const membershipLevels = ['ブロンズ', 'シルバー', 'ゴールド', 'プラチナ'];
  
  for (let i = 1; i <= 500; i++) {
    const ageGroup = ageGroups[Math.floor(Math.random() * ageGroups.length)];
    const gender = genders[Math.floor(Math.random() * genders.length)];
    const membership = membershipLevels[Math.floor(Math.random() * membershipLevels.length)];
    const purchaseCount = Math.floor(Math.random() * 20) + 1;
    const avgPurchase = Math.floor(Math.random() * 100000) + 5000;
    
    customerData.push({
      顧客ID: `CUS${String(i).padStart(4, '0')}`,
      年齢層: ageGroup,
      性別: gender,
      会員レベル: membership,
      購入回数: purchaseCount,
      平均購入金額: avgPurchase,
      総購入金額: purchaseCount * avgPurchase,
      最終購入日: new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString().split('T')[0],
      登録日: new Date(2020 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString().split('T')[0]
    });
  }
  
  // 在庫・物流データ
  const inventoryData = [];
  const warehouses = ['東京倉庫', '大阪倉庫', '名古屋倉庫', '福岡倉庫'];
  const productCategories = ['電子機器', '周辺機器', '事務用品', 'ソフトウェア'];
  
  for (let i = 1; i <= 200; i++) {
    const category = productCategories[Math.floor(Math.random() * productCategories.length)];
    const warehouse = warehouses[Math.floor(Math.random() * warehouses.length)];
    const currentStock = Math.floor(Math.random() * 1000);
    const minStock = Math.floor(Math.random() * 50) + 10;
    
    inventoryData.push({
      商品コード: `PRD${String(i).padStart(4, '0')}`,
      商品名: `商品${i}`,
      カテゴリ: category,
      倉庫: warehouse,
      現在庫数: currentStock,
      最小在庫数: minStock,
      在庫状態: currentStock < minStock ? '不足' : currentStock < minStock * 2 ? '注意' : '正常',
      単価: Math.floor(Math.random() * 50000) + 1000,
      最終入庫日: new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString().split('T')[0],
      最終出庫日: new Date(2024, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString().split('T')[0]
    });
  }
  
  // 1. 時系列分析用Excel
  const timeSeriesWorkbook = XLSX.utils.book_new();
  const timeSeriesWorksheet = XLSX.utils.json_to_sheet(timeSeriesData);
  XLSX.utils.book_append_sheet(timeSeriesWorkbook, timeSeriesWorksheet, '月次売上データ');
  XLSX.writeFile(timeSeriesWorkbook, path.join(testDataDir, 'timeseries_sales.xlsx'));
  
  // 2. 顧客分析用Excel
  const customerWorkbook = XLSX.utils.book_new();
  const customerWorksheet = XLSX.utils.json_to_sheet(customerData);
  XLSX.utils.book_append_sheet(customerWorkbook, customerWorksheet, '顧客データ');
  XLSX.writeFile(customerWorkbook, path.join(testDataDir, 'customer_analysis.xlsx'));
  
  // 3. 在庫管理用Excel
  const inventoryWorkbook = XLSX.utils.book_new();
  const inventoryWorksheet = XLSX.utils.json_to_sheet(inventoryData);
  XLSX.utils.book_append_sheet(inventoryWorkbook, inventoryWorksheet, '在庫データ');
  XLSX.writeFile(inventoryWorkbook, path.join(testDataDir, 'inventory_management.xlsx'));
  
  // 4. 統合分析用Excel（複数シート）
  const comprehensiveWorkbook = XLSX.utils.book_new();
  
  // 売上サマリーデータ
  const salesSummary = timeSeriesData.reduce((acc, item) => {
    const key = `${item.年}-${item.商品}-${item.地域}`;
    if (!acc[key]) {
      acc[key] = {
        年: item.年,
        商品: item.商品,
        地域: item.地域,
        年間売上: 0,
        年間販売数量: 0,
        年間顧客数: 0
      };
    }
    acc[key].年間売上 += item.売上金額;
    acc[key].年間販売数量 += item.販売数量;
    acc[key].年間顧客数 += item.顧客数;
    return acc;
  }, {});
  
  const salesSummarySheet = XLSX.utils.json_to_sheet(Object.values(salesSummary));
  const customerSummarySheet = XLSX.utils.json_to_sheet(customerData.slice(0, 100)); // 最初の100件
  const inventorySummarySheet = XLSX.utils.json_to_sheet(inventoryData.slice(0, 50)); // 最初の50件
  
  XLSX.utils.book_append_sheet(comprehensiveWorkbook, salesSummarySheet, '売上サマリー');
  XLSX.utils.book_append_sheet(comprehensiveWorkbook, customerSummarySheet, '顧客サマリー');
  XLSX.utils.book_append_sheet(comprehensiveWorkbook, inventorySummarySheet, '在庫サマリー');
  XLSX.writeFile(comprehensiveWorkbook, path.join(testDataDir, 'comprehensive_analysis.xlsx'));
  
  console.log('高度な分析用Excelファイルを作成しました:');
  console.log('- timeseries_sales.xlsx (時系列売上データ - 3年分の月次データ)');
  console.log('- customer_analysis.xlsx (顧客分析データ - 500件の顧客情報)');
  console.log('- inventory_management.xlsx (在庫管理データ - 200商品の在庫情報)');
  console.log('- comprehensive_analysis.xlsx (統合分析用 - 複数シートの統合データ)');
}

// メイン実行
if (require.main === module) {
  createAdvancedExcelFiles();
}

module.exports = { createAdvancedExcelFiles };