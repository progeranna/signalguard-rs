CREATE TABLE anomalies (
    id UUID PRIMARY KEY,
    symbol TEXT NOT NULL,
    anomaly_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    message TEXT NOT NULL,
    observed_value DOUBLE PRECISION,
    threshold_value DOUBLE PRECISION,
    event_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX anomalies_symbol_created_at_idx ON anomalies (symbol, created_at DESC);
CREATE INDEX anomalies_anomaly_type_created_at_idx ON anomalies (anomaly_type, created_at DESC);
