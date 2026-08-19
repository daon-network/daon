//! The DAON provenance agent, as a library.
//!
//! The daemon binary is a thin shell over this: argument parsing, socket
//! binding, and a thread per connection. Everything with behaviour worth
//! checking lives here so it can be tested without a socket, a keychain or a
//! clock.

pub mod api;
pub mod http;
pub mod server;
pub mod witness_loop;

pub use api::{Agent, Reply};
