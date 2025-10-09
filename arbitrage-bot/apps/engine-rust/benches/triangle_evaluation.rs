use criterion::{black_box, criterion_group, criterion_main, Criterion};
use arbitrage_engine::triangle::{enumerate_triangles, evaluate_triangle};

fn bench_triangle_enumeration(c: &mut Criterion) {
    let markets = vec![
        "BTCUSDT".to_string(),
        "BTCINR".to_string(),
        "USDTINR".to_string(),
        "ETHUSDT".to_string(),
        "ETHINR".to_string(),
        "ADAUSDT".to_string(),
        "ADAINR".to_string(),
    ];
    
    c.bench_function("enumerate_triangles", |b| {
        b.iter(|| enumerate_triangles(black_box(&markets)))
    });
}

fn bench_triangle_evaluation(c: &mut Criterion) {
    let markets = vec![
        "BTCUSDT".to_string(),
        "BTCINR".to_string(),
        "USDTINR".to_string(),
    ];
    
    let order_book = std::collections::HashMap::new();
    
    c.bench_function("evaluate_triangle", |b| {
        b.iter(|| {
            for triangle in enumerate_triangles(&markets) {
                evaluate_triangle(black_box(&triangle), black_box(&order_book));
            }
        })
    });
}

criterion_group!(benches, bench_triangle_enumeration, bench_triangle_evaluation);
criterion_main!(benches);

