export async function monitorPageSpeed(url: string, strategy: 'desktop' | 'mobile' = 'desktop') {
  // Free public endpoint without API key (rate limited)
  const apiEndpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}`;
  
  try {
    const response = await fetch(apiEndpoint);
    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    const lighthouseMetrics = data.lighthouseResult.audits;

    return {
      success: true,
      performanceScore: data.lighthouseResult.categories.performance.score * 100,
      firstContentfulPaint: lighthouseMetrics['first-contentful-paint'].displayValue,
      largestContentfulPaint: lighthouseMetrics['largest-contentful-paint'].displayValue,
      speedIndex: lighthouseMetrics['speed-index'].displayValue,
      cumulativeLayoutShift: lighthouseMetrics['cumulative-layout-shift'].displayValue,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}
