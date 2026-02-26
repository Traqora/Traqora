#![no_std]

#[path = "proxy/lib.rs"]
pub mod proxy;

#[path = "storage_version/lib.rs"]
pub mod storage_version;

#[path = "airline/lib.rs"]
pub mod airline;

#[path = "booking/lib.rs"]
pub mod booking;

#[path = "dispute/lib.rs"]
pub mod dispute;

#[path = "governance/lib.rs"]
pub mod governance;

#[path = "loyalty/lib.rs"]
pub mod loyalty;

#[path = "refund/lib.rs"]
pub mod refund;

#[path = "token/lib.rs"]
pub mod token;

#[path = "oracle/lib.rs"]
pub mod oracle;
