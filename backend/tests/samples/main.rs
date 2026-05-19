use std::collections::HashMap;
use tokio::net::TcpListener;
use serde::{Deserialize, Serialize};

mod config;
mod handlers;

/// Central application state shared across handlers.
pub struct AppState {
    pub db: HashMap<String, String>,
    pub config: config::Config,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum AppError {
    NotFound,
    Internal(String),
    Unauthorized,
}

/// Core service trait that all handler types must implement.
pub trait Service {
    fn handle(&self) -> Result<(), AppError>;
    fn name(&self) -> &str;
}

impl Service for AppState {
    fn handle(&self) -> Result<(), AppError> {
        Ok(())
    }

    fn name(&self) -> &str {
        "AppState"
    }
}

impl AppState {
    pub fn new() -> Self {
        Self {
            db: HashMap::new(),
            config: config::Config::default(),
        }
    }
}

pub async fn run_server(addr: &str) {
    let _listener = TcpListener::bind(addr).await.unwrap();
}

fn main() {
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(run_server("0.0.0.0:8080"));
}
