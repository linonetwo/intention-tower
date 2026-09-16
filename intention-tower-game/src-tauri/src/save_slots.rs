/// Validate a user-visible save slot before it is used as a filesystem name.
/// The same grammar is mirrored by the browser adapter for platform parity.
pub fn validate_save_slot(slot: &str) -> Result<(), String> {
    if slot.is_empty() || slot.len() > 64 {
        return Err("save slot must contain 1 to 64 characters".to_owned());
    }
    if !slot
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err("save slot may only contain letters, numbers, '-' and '_'".to_owned());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_save_slot;

    #[test]
    fn rejects_path_traversal_and_accepts_portable_names() {
        assert!(validate_save_slot("pavlov-tick42").is_ok());
        assert!(validate_save_slot("slot_01").is_ok());
        assert!(validate_save_slot("../escape").is_err());
        assert!(validate_save_slot("a/b").is_err());
        assert!(validate_save_slot("").is_err());
    }
}
