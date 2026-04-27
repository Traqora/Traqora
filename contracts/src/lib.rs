#![no_std]

pub mod access;

#[path = "proxy/lib.rs"]
pub mod proxy;

#[path = "storage_version/lib.rs"]
pub mod storage_version;

#[path = "airline/lib.rs"]
pub mod airline;

#[path = "flight_registry/lib.rs"]
pub mod flight_registry;

#[path = "booking/lib.rs"]
pub mod booking;

#[path = "flight_booking/lib.rs"]
pub mod flight_booking;

#[path = "dispute/lib.rs"]
pub mod dispute;

#[path = "dispute_resolution/lib.rs"]
pub mod dispute_resolution;

#[path = "governance/lib.rs"]
pub mod governance;

#[path = "loyalty/lib.rs"]
pub mod loyalty;

#[path = "refund/lib.rs"]
pub mod refund;

#[path = "refund_automation/lib.rs"]
pub mod refund_automation;

#[path = "token/lib.rs"]
pub mod token;

#[path = "oracle/lib.rs"]
pub mod oracle;

#[path = "admin/lib.rs"]
pub mod admin;

#[path = "booking_receipt/lib.rs"]
pub mod booking_receipt;
