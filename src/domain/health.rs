use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Info,
    Warning,
    Critical,
}

impl Severity {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Info => "info",
            Self::Warning => "warning",
            Self::Critical => "critical",
        }
    }

    pub fn parse(value: &str) -> anyhow::Result<Self> {
        match value {
            "info" => Ok(Self::Info),
            "warning" => Ok(Self::Warning),
            "critical" => Ok(Self::Critical),
            _ => anyhow::bail!("unsupported severity value: {value}"),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Unhealthy,
}

#[cfg(test)]
mod tests {
    use super::{HealthStatus, Severity};

    #[test]
    fn severity_serializes_in_api_friendly_form() {
        let serialized = serde_json::to_string(&Severity::Critical).unwrap();

        assert_eq!(serialized, "\"critical\"");
    }

    #[test]
    fn health_status_serializes_in_api_friendly_form() {
        let serialized = serde_json::to_string(&HealthStatus::Degraded).unwrap();

        assert_eq!(serialized, "\"degraded\"");
    }
}
