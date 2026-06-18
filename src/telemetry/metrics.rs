use super::InternalCountersSnapshot;

const PROMETHEUS_LINE_CAPACITY: usize = 512;

pub fn render_prometheus_metrics(snapshot: &InternalCountersSnapshot) -> String {
    let mut output = String::with_capacity(PROMETHEUS_LINE_CAPACITY);

    render_event_counters(&mut output, snapshot);
    render_parse_error_counters(&mut output, snapshot);
    render_reconnect_counters(&mut output, snapshot);
    render_infra_error_counters(&mut output, snapshot);
    render_runtime_metrics(&mut output, snapshot);

    output
}

fn render_event_counters(output: &mut String, snapshot: &InternalCountersSnapshot) {
    render_labeled_counter_family(
        output,
        "signalguard_events_processed_total",
        "Total number of normalized events processed by SignalGuard, partitioned by source and event type.",
        &[
            (
                &[("source", "replay"), ("event_type", "trade")],
                snapshot.replay_trade_events,
            ),
            (
                &[("source", "replay"), ("event_type", "quote")],
                snapshot.replay_quote_events,
            ),
            (
                &[("source", "replay"), ("event_type", "depth")],
                snapshot.replay_depth_events,
            ),
            (
                &[("source", "binance"), ("event_type", "trade")],
                snapshot.binance_trade_events,
            ),
            (
                &[("source", "binance"), ("event_type", "quote")],
                snapshot.binance_quote_events,
            ),
            (
                &[("source", "binance"), ("event_type", "depth")],
                snapshot.binance_depth_events,
            ),
        ],
    );
}

fn render_parse_error_counters(output: &mut String, snapshot: &InternalCountersSnapshot) {
    render_metric(
        output,
        "signalguard_parse_errors_total",
        "Total number of normalized event parse errors observed by SignalGuard.",
        "counter",
        snapshot.parse_errors,
    );
    render_labeled_counter_family(
        output,
        "signalguard_source_parse_errors_total",
        "Total number of normalized event parse errors observed by SignalGuard, partitioned by source.",
        &[
            (&[("source", "replay")], snapshot.replay_parse_errors),
            (&[("source", "binance")], snapshot.binance_parse_errors),
        ],
    );
}

fn render_reconnect_counters(output: &mut String, snapshot: &InternalCountersSnapshot) {
    render_metric(
        output,
        "signalguard_reconnect_attempts_total",
        "Total number of Binance live stream reconnect attempts observed by SignalGuard.",
        "counter",
        snapshot.reconnect_attempts,
    );
    render_labeled_counter_family(
        output,
        "signalguard_source_reconnect_attempts_total",
        "Total number of reconnect attempts observed by SignalGuard, partitioned by source.",
        &[(
            &[("source", "binance")],
            snapshot.binance_reconnect_attempts,
        )],
    );
}

fn render_infra_error_counters(output: &mut String, snapshot: &InternalCountersSnapshot) {
    render_metric(
        output,
        "signalguard_storage_errors_total",
        "Total number of PostgreSQL storage errors observed by SignalGuard.",
        "counter",
        snapshot.storage_errors,
    );
    render_metric(
        output,
        "signalguard_cache_errors_total",
        "Total number of Redis cache errors observed by SignalGuard.",
        "counter",
        snapshot.cache_errors,
    );
}

fn render_runtime_metrics(output: &mut String, snapshot: &InternalCountersSnapshot) {
    render_metric(
        output,
        "signalguard_last_message_age_ms",
        "Age in milliseconds of the last processed normalized message. Renders 0 before any message has been processed.",
        "gauge",
        snapshot.last_message_age_ms.unwrap_or(0),
    );
}

fn render_metric(output: &mut String, name: &str, help: &str, metric_type: &str, value: u64) {
    render_metric_header(output, name, help, metric_type);
    render_metric_value(output, name, value);
}

fn render_labeled_counter_family(
    output: &mut String,
    name: &str,
    help: &str,
    samples: &[(&[(&str, &str)], u64)],
) {
    render_metric_header(output, name, help, "counter");

    for (labels, value) in samples {
        output.push_str(name);
        output.push('{');
        render_labels(output, labels);
        output.push('}');
        output.push(' ');
        output.push_str(&value.to_string());
        output.push('\n');
    }
}

fn render_metric_header(output: &mut String, name: &str, help: &str, metric_type: &str) {
    output.push_str("# HELP ");
    output.push_str(name);
    output.push(' ');
    output.push_str(help);
    output.push('\n');

    output.push_str("# TYPE ");
    output.push_str(name);
    output.push(' ');
    output.push_str(metric_type);
    output.push('\n');
}

fn render_metric_value(output: &mut String, name: &str, value: u64) {
    output.push_str(name);
    output.push(' ');
    output.push_str(&value.to_string());
    output.push('\n');
}

fn render_labels(output: &mut String, labels: &[(&str, &str)]) {
    for (index, (label, label_value)) in labels.iter().enumerate() {
        if index > 0 {
            output.push(',');
        }
        output.push_str(label);
        output.push_str("=\"");
        output.push_str(label_value);
        output.push('"');
    }
}

#[cfg(test)]
mod tests {
    use super::render_prometheus_metrics;
    use crate::telemetry::InternalCountersSnapshot;

    #[test]
    fn render_prometheus_metrics_includes_all_required_metric_names() {
        let metrics = render_prometheus_metrics(&snapshot());

        assert!(metrics.contains("signalguard_events_processed_total"));
        assert!(metrics.contains("signalguard_parse_errors_total"));
        assert!(metrics.contains("signalguard_source_parse_errors_total"));
        assert!(metrics.contains("signalguard_reconnect_attempts_total"));
        assert!(metrics.contains("signalguard_source_reconnect_attempts_total"));
        assert!(metrics.contains("signalguard_storage_errors_total"));
        assert!(metrics.contains("signalguard_cache_errors_total"));
        assert!(metrics.contains("signalguard_last_message_age_ms"));
    }

    #[test]
    fn render_prometheus_metrics_renders_counter_values() {
        let metrics = render_prometheus_metrics(&snapshot());

        assert!(metrics.contains(
            "signalguard_events_processed_total{source=\"replay\",event_type=\"trade\"} 11"
        ));
        assert!(metrics.contains(
            "signalguard_events_processed_total{source=\"replay\",event_type=\"quote\"} 13"
        ));
        assert!(metrics.contains(
            "signalguard_events_processed_total{source=\"replay\",event_type=\"depth\"} 15"
        ));
        assert!(metrics.contains(
            "signalguard_events_processed_total{source=\"binance\",event_type=\"trade\"} 17"
        ));
        assert!(metrics.contains(
            "signalguard_events_processed_total{source=\"binance\",event_type=\"quote\"} 19"
        ));
        assert!(metrics.contains(
            "signalguard_events_processed_total{source=\"binance\",event_type=\"depth\"} 21"
        ));
        assert!(metrics.contains("signalguard_parse_errors_total 2"));
        assert!(metrics.contains("signalguard_source_parse_errors_total{source=\"replay\"} 23"));
        assert!(metrics.contains("signalguard_source_parse_errors_total{source=\"binance\"} 29"));
        assert!(metrics.contains("signalguard_reconnect_attempts_total 3"));
        assert!(
            metrics.contains("signalguard_source_reconnect_attempts_total{source=\"binance\"} 31")
        );
        assert!(metrics.contains("signalguard_storage_errors_total 5"));
        assert!(metrics.contains("signalguard_cache_errors_total 7"));
    }

    #[test]
    fn render_prometheus_metrics_renders_last_message_age_ms() {
        let metrics = render_prometheus_metrics(&snapshot());

        assert!(metrics.contains("signalguard_last_message_age_ms 1234"));
        assert!(metrics.contains("# TYPE signalguard_last_message_age_ms gauge"));
    }

    #[test]
    fn render_prometheus_metrics_uses_zero_for_missing_last_message_age() {
        let metrics = render_prometheus_metrics(&InternalCountersSnapshot {
            parse_errors: 0,
            replay_parse_errors: 0,
            binance_parse_errors: 0,
            reconnect_attempts: 0,
            binance_reconnect_attempts: 0,
            storage_errors: 0,
            cache_errors: 0,
            replay_trade_events: 0,
            replay_quote_events: 0,
            replay_depth_events: 0,
            binance_trade_events: 0,
            binance_quote_events: 0,
            binance_depth_events: 0,
            last_message_unix_ms: None,
            last_message_age_ms: None,
        });

        assert!(metrics.contains("signalguard_last_message_age_ms 0"));
    }

    fn snapshot() -> InternalCountersSnapshot {
        InternalCountersSnapshot {
            parse_errors: 2,
            replay_parse_errors: 23,
            binance_parse_errors: 29,
            reconnect_attempts: 3,
            binance_reconnect_attempts: 31,
            storage_errors: 5,
            cache_errors: 7,
            replay_trade_events: 11,
            replay_quote_events: 13,
            replay_depth_events: 15,
            binance_trade_events: 17,
            binance_quote_events: 19,
            binance_depth_events: 21,
            last_message_unix_ms: Some(1_767_225_600_000),
            last_message_age_ms: Some(1_234),
        }
    }
}
