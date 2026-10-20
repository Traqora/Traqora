use std::collections::HashSet;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Scenario {
    UnauthorizedAccess,
    DataExfiltration,
    KeyCompromise,
}

impl Scenario {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s {
            "UNAUTHORIZED_ACCESS" => Ok(Scenario::UnauthorizedAccess),
            "DATA_EXFILTRATION" => Ok(Scenario::DataExfiltration),
            "KEY_COMPROMISE" => Ok(Scenario::KeyCompromise},
            _ => Err("INVALID_SCENARIO".to_string()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DrillRequest {
    pub drill_id: String,
    pub scenario: String,
    pub dry_run: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DrillResult {
    pub status: String,
    pub timestamp: String,
    pub findings: Vec<String>,
}

pub struct DrillManager {
    active_drills: HashSet<String>,
}

impl DrillManager {
    pub fn new() -> Self {
        Self {
            active_drills: HashSet::new(),
        }
    }

    pub fn execute_drill(&mut self, req: &DrillRequest) -> Result<DrillResult, String> {
        let _scenario_enum = Scenario::parse(&req.scenario)?;
        if self.active_drills.contains(&req.drill_id) {
            return Err("DRILL_ALREADY_ACTIVE".to_string());
        }
        self.active_drills.insert(req.drill_id.clone());

        let mut findings = vec![format!("Initiated drill {} with scenario {}", req.drill_id, req.scenario)];
        if req.dry_run {
            findings.push("Dry run mode: actions simulated only.".to_string());
        } else {
            findings.push("Enforced mode: containment actions executed.".to_string());
        }

        self.active_drills.remove(&req.drill_id);

        Ok(DrillResult {
            status: "SUCCESS".to_string(),
            timestamp: "2023-01-01T00:00:00Z".to_string(),
            findings,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_drill_happy_path() {
        let mut manager = DrillManager::new();
        let req = DrillRequest {
            drill_id: "drill-001".to_string(),
            scenario: "UNAUTHORIZED_ACCESS".to_string(),
            dry_run: true,
        };
        let res = manager.execute_drill(&req).unwrap();
        assert_eq!(res.status, "SUCCESS");
        assert!(!res.findings.is_empty());
    }

    #[test]
    fn test_invalid_scenario() {
        let mut manager = DrillManager::new();
        let req = DrillRequest {
            drill_id: "drill-002".to_string(),
            scenario: "UNKNOWN_SCENARIO".to_string(),
            dry_run: false,
        };
        let res = manager.execute_drill(&req);
        assert_eq!(res, Err("INVALID_SCENARIO".to_string()));
    }

    #[test]
    fn test_drill_already_active() {
        let mut manager = DrillManager::new();
        manager.active_drills.insert("drill-003".to_string());
        let req = DrillRequest {
            drill_id: "drill-003".to_string(),
            scenario: "DATA_EXFILTRATION".to_string(),
            dry_run: true,
        };
        let res = manager.execute_drill(&req);
        assert_eq!(res, Err("DRILL_ALREADY_ACTIVE".to_string()));
    }
}
