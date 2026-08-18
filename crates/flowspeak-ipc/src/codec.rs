//! Length-prefixed JSON framing over any byte stream (the sidecar's stdio pipes).
//!
//! Frame layout: `[u32 length little-endian][UTF-8 JSON body]`.
//! A frame body must not exceed [`MAX_FRAME_LEN`]; oversized frames are rejected
//! rather than allocated, so a corrupt length can never trigger a huge allocation.

use std::io::{self, Read, Write};

use serde::{de::DeserializeOwned, Serialize};

/// Upper bound on a single frame's JSON body (16 MiB). Dictation payloads are tiny;
/// this only exists to reject a corrupt/garbage length prefix.
pub const MAX_FRAME_LEN: usize = 16 * 1024 * 1024;

#[derive(Debug, thiserror::Error)]
pub enum CodecError {
    #[error("io error: {0}")]
    Io(#[from] io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("frame length {0} exceeds maximum {MAX_FRAME_LEN}")]
    FrameTooLarge(usize),
}

/// Serialize `msg` and write it as one length-prefixed frame, then flush.
pub fn write_frame<W: Write, T: Serialize>(w: &mut W, msg: &T) -> Result<(), CodecError> {
    let body = serde_json::to_vec(msg)?;
    if body.len() > MAX_FRAME_LEN {
        return Err(CodecError::FrameTooLarge(body.len()));
    }
    let len = body.len() as u32;
    w.write_all(&len.to_le_bytes())?;
    w.write_all(&body)?;
    w.flush()?;
    Ok(())
}

/// Read exactly one length-prefixed frame and deserialize it.
///
/// Returns `Ok(None)` on a clean EOF at a frame boundary (peer closed the pipe),
/// so a read loop can treat that as an orderly shutdown rather than an error.
pub fn read_frame<R: Read, T: DeserializeOwned>(r: &mut R) -> Result<Option<T>, CodecError> {
    let mut len_buf = [0u8; 4];
    match read_exact_or_eof(r, &mut len_buf)? {
        ReadEnd::Eof => return Ok(None),
        ReadEnd::Filled => {}
    }
    let len = u32::from_le_bytes(len_buf) as usize;
    if len > MAX_FRAME_LEN {
        return Err(CodecError::FrameTooLarge(len));
    }
    let mut body = vec![0u8; len];
    // A partial body after a valid length prefix is a genuine protocol error, not EOF.
    r.read_exact(&mut body)?;
    Ok(Some(serde_json::from_slice(&body)?))
}

enum ReadEnd {
    Filled,
    Eof,
}

/// Like `read_exact`, but a clean EOF *before the first byte* reports `Eof`
/// instead of erroring — that is the one place EOF is expected (frame boundary).
fn read_exact_or_eof<R: Read>(r: &mut R, buf: &mut [u8]) -> Result<ReadEnd, io::Error> {
    let mut filled = 0;
    while filled < buf.len() {
        match r.read(&mut buf[filled..]) {
            Ok(0) => {
                if filled == 0 {
                    return Ok(ReadEnd::Eof);
                }
                return Err(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "eof in the middle of a frame length prefix",
                ));
            }
            Ok(n) => filled += n,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        }
    }
    Ok(ReadEnd::Filled)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ShellToSidecar, SidecarToShell};

    #[test]
    fn round_trips_a_message() {
        let mut buf: Vec<u8> = Vec::new();
        let msg = ShellToSidecar::Ping { seq: 42 };
        write_frame(&mut buf, &msg).unwrap();

        let mut cursor = std::io::Cursor::new(buf);
        let got: Option<ShellToSidecar> = read_frame(&mut cursor).unwrap();
        assert!(matches!(got, Some(ShellToSidecar::Ping { seq: 42 })));
    }

    #[test]
    fn round_trips_multiple_frames_in_order() {
        let mut buf: Vec<u8> = Vec::new();
        write_frame(&mut buf, &SidecarToShell::Pong { seq: 1 }).unwrap();
        write_frame(&mut buf, &SidecarToShell::Pong { seq: 2 }).unwrap();

        let mut cursor = std::io::Cursor::new(buf);
        let a: Option<SidecarToShell> = read_frame(&mut cursor).unwrap();
        let b: Option<SidecarToShell> = read_frame(&mut cursor).unwrap();
        let c: Option<SidecarToShell> = read_frame(&mut cursor).unwrap();
        assert!(matches!(a, Some(SidecarToShell::Pong { seq: 1 })));
        assert!(matches!(b, Some(SidecarToShell::Pong { seq: 2 })));
        assert!(c.is_none(), "clean EOF at frame boundary yields None");
    }

    #[test]
    fn rejects_oversized_length_without_allocating() {
        // A length prefix claiming > MAX_FRAME_LEN must error, not try to allocate it.
        let bogus_len = (MAX_FRAME_LEN as u32 + 1).to_le_bytes();
        let mut cursor = std::io::Cursor::new(bogus_len.to_vec());
        let res: Result<Option<ShellToSidecar>, _> = read_frame(&mut cursor);
        assert!(matches!(res, Err(CodecError::FrameTooLarge(_))));
    }
}
